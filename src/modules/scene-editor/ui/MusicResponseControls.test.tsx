import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeAudioResponseConfig, type AudioResponseConfig } from '@shared/lib'
import { MusicResponseControls, type MusicResponseControlsProps } from './MusicResponseControls'

const classicSettings = { inputGain: 0.8, peakEmphasis: 3, restingResponse: 0.1, smoothing: 0.2, responseOffset: 0.4 }

function configWithMappings(): AudioResponseConfig {
  return normalizeAudioResponseConfig({ version: 1, sensitivity: 1.3, mappings: [
    { target: 'size', source: 'overall-hit', amount: 0.8, attack: 0.04, release: 0.35 },
    { target: 'bass', source: 'bass-level', amount: 1.2, attack: 0.1, release: 0.7 },
    { target: 'treble', source: 'treble-hit', amount: 0.6, attack: 0.2, release: 0.4 },
  ] }).config
}

function ControlledControls({ initialConfig = configWithMappings(), onChange = vi.fn(), ...props }: Partial<MusicResponseControlsProps> & {
  initialConfig?: AudioResponseConfig
  onChange?: (config: AudioResponseConfig) => void
}) {
  const [config, setConfig] = useState(initialConfig)
  const [mode, setMode] = useState<MusicResponseControlsProps['mode']>('mapped-v1')
  return <MusicResponseControls
    mode={mode} config={config} supportedTargets={['size', 'bass']}
    onModeChange={setMode} onReset={vi.fn()} canReset
    classicSettings={classicSettings} onClassicSettingChange={vi.fn()}
    onConfigChange={(next) => { setConfig(next); onChange(next) }}
    {...props}
  />
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('MusicResponseControls', () => {
  it('groups custom controls by sound, strength, and movement and only shows relevant tuning', async () => {
    const onChange = vi.fn()
    render(<ControlledControls onChange={onChange} />)
    expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual([
      'What should it react to?', 'How strongly should it react?', 'How should it move?',
    ])
    expect(within(screen.getByRole('group', { name: 'What should it react to?' })).getByRole('combobox', { name: 'Frequency focus' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'How strongly should it react?' })).getByRole('slider', { name: 'Hit sensitivity' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Rise time' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'level')
    expect(screen.queryByRole('slider', { name: 'Hit sensitivity' })).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Amount' })).toBeInTheDocument()
    expect(onChange.mock.lastCall![0].sensitivity).toBe(1.3)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'hit')
    expect(screen.getByRole('slider', { name: 'Hit sensitivity' })).toHaveValue('1.3')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'custom')
    expect(screen.getByRole('slider', { name: 'Rise time' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'quick')
    expect(screen.queryByRole('slider', { name: 'Rise time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '0' } })
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    expect(screen.getAllByRole('group')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Reset music settings' })).toBeInTheDocument()
  })

  it('keeps Original tuning together and opening advanced music controls only reveals the saved offset', async () => {
    const onClassicSettingChange = vi.fn()
    const onChange = vi.fn()
    render(<ControlledControls mode="legacy" onChange={onChange} onClassicSettingChange={onClassicSettingChange} />)
    const tuning = within(screen.getByRole('group', { name: 'Original response tuning' }))
    for (const label of ['Input gain', 'Peak emphasis', 'Resting response', 'Smoothing']) {
      expect(tuning.getByRole('slider', { name: label })).toBeVisible()
    }
    expect(screen.queryByRole('spinbutton', { name: 'Response offset' })).not.toBeInTheDocument()
    const user = userEvent.setup()
    const advanced = screen.getByRole('button', { name: 'Show advanced music controls' })
    expect(advanced).toHaveAttribute('aria-expanded', 'false')
    await user.click(advanced)
    expect(advanced).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Response offset' })).toHaveValue(0.4)
    await user.click(screen.getByRole('button', { name: 'Hide advanced music controls' }))
    expect(screen.queryByRole('spinbutton', { name: 'Response offset' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show advanced music controls' }))
    expect(screen.getByRole('spinbutton', { name: 'Response offset' })).toHaveValue(0.4)
    expect(onClassicSettingChange).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(tuning.getByRole('spinbutton', { name: 'Input gain numeric value' }), { target: { value: '1.2' } })
    expect(onClassicSettingChange).toHaveBeenLastCalledWith('inputGain', 1.2)
    fireEvent.change(tuning.getByRole('spinbutton', { name: 'Peak emphasis numeric value' }), { target: { value: '4' } })
    expect(onClassicSettingChange).toHaveBeenLastCalledWith('peakEmphasis', 4)
    fireEvent.change(tuning.getByRole('spinbutton', { name: 'Resting response numeric value' }), { target: { value: '0.3' } })
    expect(onClassicSettingChange).toHaveBeenLastCalledWith('restingResponse', 0.3)
    fireEvent.change(tuning.getByRole('spinbutton', { name: 'Smoothing numeric value' }), { target: { value: '0.5' } })
    expect(onClassicSettingChange).toHaveBeenLastCalledWith('smoothing', 0.5)
    fireEvent.change(tuning.getByRole('spinbutton', { name: 'Response offset' }), { target: { value: '-0.2' } })
    expect(onClassicSettingChange).toHaveBeenLastCalledWith('responseOffset', -0.2)
  })

  it('retains an explicit Custom style across modes, movement changes, and section unmounts', async () => {
    const onChange = vi.fn()
    function SectionHarness({ visible, mode = 'mapped-v1' }: { visible: boolean; mode?: MusicResponseControlsProps['mode'] }) {
      const [drafts, setDrafts] = useState<NonNullable<MusicResponseControlsProps['customTimingDrafts']>>({})
      return visible ? <ControlledControls
        mode={mode} onChange={onChange} customTimingDrafts={drafts} onCustomTimingDraftsChange={setDrafts}
      /> : <p>Another section</p>
    }
    const { rerender } = render(<SectionHarness visible />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'custom')
    expect(onChange).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'bass')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'size')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    rerender(<SectionHarness visible mode="legacy" />)
    expect(screen.queryByRole('combobox', { name: 'Response style' })).not.toBeInTheDocument()
    rerender(<SectionHarness visible />)
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    rerender(<SectionHarness visible={false} />)
    rerender(<SectionHarness visible />)
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.04)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(0.35)
    await user.click(screen.getByRole('button', { name: 'Reset music settings' }))
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('balanced')
    expect(screen.queryByRole('slider', { name: 'Rise time' })).not.toBeInTheDocument()
  })

  it('updates frequency and follow independently while preserving every other mapping', async () => {
    const onChange = vi.fn()
    const original = configWithMappings()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Music response', level: 3 })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Response target' })).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Size', 'Bass response'])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency focus' }), 'mid')
    expect(onChange).toHaveBeenLastCalledWith({ ...original, mappings: [
      { ...original.mappings[0], source: 'mid-hit' }, ...original.mappings.slice(1),
    ] })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'level')
    const changed = onChange.mock.lastCall![0] as AudioResponseConfig
    expect(changed.mappings[0].source).toBe('mid-level')
    expect(changed.mappings.slice(1)).toEqual(original.mappings.slice(1))
    expect(original.mappings[0].source).toBe('overall-hit')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'bass')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('bass')
    expect(screen.getByRole('combobox', { name: 'Follow' })).toHaveValue('level')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute('aria-valuetext', '1.2')
  })

  it('shows an unmapped target with zero amount without changing the saved configuration', () => {
    const original = configWithMappings()
    const disabledConfig = { ...original, mappings: original.mappings.filter((mapping) => mapping.target !== 'size') }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={disabledConfig} supportedTargets={['size']} onChange={onChange} />)
    expect(screen.queryByRole('heading', { name: 'Size' })).not.toBeInTheDocument()
    expect(screen.queryByText('Movement')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Response target' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('overall')
    expect(screen.getByRole('combobox', { name: 'Follow' })).toHaveValue('hit')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('balanced')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '1.6' } })
    expect(onChange.mock.lastCall![0].mappings).toEqual([
      ...disabledConfig.mappings,
      { target: 'size', source: 'overall-hit', amount: 1.6, attack: 0.04, release: 0.35 },
    ])
  })

  it.each(['source', 'timing'] as const)('editing %s on an unmapped target preserves zero amount and every other mapping', async (edit) => {
    const original = configWithMappings()
    const disabledConfig = { ...original, mappings: original.mappings.filter((mapping) => mapping.target !== 'size') }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={disabledConfig} supportedTargets={['size']} onChange={onChange} />)
    const user = userEvent.setup()
    if (edit === 'source') {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency focus' }), 'mid')
    } else {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'flowing')
    }
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.lastCall![0].mappings).toEqual([
      ...disabledConfig.mappings,
      {
        target: 'size', source: edit === 'source' ? 'mid-hit' : 'overall-hit', amount: 0,
        attack: edit === 'timing' ? 0.2 : 0.04, release: edit === 'timing' ? 1 : 0.35,
      },
    ])
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
  })

  it('keeps sensitivity global and amount local, with bounded numeric inputs', () => {
    const onChange = vi.fn()
    const original = configWithMappings()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hit sensitivity numeric value' }), { target: { value: '2.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...original, sensitivity: 2.5 })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '99' } })
    const changed = onChange.mock.lastCall![0] as AudioResponseConfig
    expect(changed.sensitivity).toBe(2.5)
    expect(changed.mappings[0].amount).toBe(4)
    expect(changed.mappings.slice(1)).toEqual(original.mappings.slice(1))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hit sensitivity numeric value' }), { target: { value: '0' } })
    expect(onChange.mock.lastCall![0].sensitivity).toBe(0.1)
    expect(screen.getByText(/shared by all movements following Sharp hits/i)).toBeInTheDocument()
  })

  it('gives the Amount slider fine low-end control while reporting raw values accessibly', () => {
    const original = configWithMappings()
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'Amount' })
    const numeric = screen.getByRole('spinbutton', { name: 'Amount numeric value' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(slider, { target: { value: '0.25' } })
    expect(onChange.mock.lastCall![0].mappings).toEqual([
      { ...original.mappings[0], amount: 0.05 }, ...original.mappings.slice(1),
    ])
    expect(numeric).toHaveValue(0.05)
    expect(numeric).toBeValid()
    expect(slider).toHaveAttribute('aria-valuetext', '0.05')
    fireEvent.change(slider, { target: { value: '0.251' } })
    expect(onChange.mock.lastCall![0].mappings[0].amount).toBe(0.0502)
    fireEvent.change(slider, { target: { value: '0.001' } })
    expect(numeric).toHaveValue(0.0002)
    expect(numeric).toBeValid()
    expect(slider).toHaveAttribute('aria-valuetext', '0.0002')
    fireEvent.change(slider, { target: { value: '0' } })
    expect(numeric).toHaveValue(0)
    fireEvent.change(slider, { target: { value: '1' } })
    expect(numeric).toHaveValue(4)
  })

  it('preserves exact saved Amount values and supports precise numeric editing without step errors', async () => {
    const original = configWithMappings()
    original.mappings[0].amount = 0.0123456789
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    const numeric = screen.getByRole('spinbutton', { name: 'Amount numeric value' })
    expect(numeric).toHaveValue(0.0123456789)
    expect(numeric).toBeValid()
    expect(onChange).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency focus' }), 'mid')
    expect(onChange.mock.lastCall![0].mappings[0].amount).toBe(0.0123456789)
    numeric.focus()
    await user.keyboard('[ArrowUp]')
    expect(numeric).toHaveValue(0.0133456789)
    await user.keyboard('[ArrowDown]')
    expect(numeric).toHaveValue(0.0123456789)
    fireEvent.change(numeric, { target: { value: '3.5' } })
    expect(onChange.mock.lastCall![0].mappings[0].amount).toBe(3.5)
    expect(numeric).toBeValid()
    fireEvent.change(numeric, { target: { value: '0.00000001' } })
    expect(numeric).toHaveValue(0.00000001)
    expect(numeric).toBeValid()
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute('aria-valuetext', '1e-8')
    await user.keyboard('[ArrowDown]')
    expect(numeric).toHaveValue(0)
  })

  it('retains each target’s source and timing when its amount is zero', async () => {
    const original = configWithMappings()
    original.mappings[0] = { target: 'size', source: 'mid-level', amount: 2.1, attack: 0.37, release: 1.8 }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    const user = userEvent.setup()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '0' } })
    expect(onChange.mock.lastCall![0].mappings).toEqual([{ ...original.mappings[0], amount: 0 }, ...original.mappings.slice(1)])
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('mid')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'bass')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '0' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'size')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('mid')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.37)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(1.8)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '2.1' } })
    expect(onChange.mock.lastCall![0].mappings.find((mapping: { target: string }) => mapping.target === 'size')).toEqual(original.mappings[0])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'bass')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '1.2' } })
    expect(onChange.mock.lastCall![0].mappings.find((mapping: { target: string }) => mapping.target === 'bass')).toEqual(original.mappings[1])
    expect(onChange.mock.lastCall![0]).toEqual(original)
  })

  it('retains zero amount and tuning through section unmounts using the saved configuration', async () => {
    const original = configWithMappings()
    original.mappings[0] = { target: 'size', source: 'treble-level', amount: 2.3, attack: 0.63, release: 1.7 }
    const onChange = vi.fn()
    function SectionHarness({ visible }: { visible: boolean }) {
      const [config, setConfig] = useState(original)
      return visible ? <MusicResponseControls
        mode="mapped-v1" config={config} supportedTargets={['size']}
        onModeChange={vi.fn()} onConfigChange={(next) => { setConfig(next); onChange(next) }} canReset onReset={() => setConfig(original)}
        classicSettings={classicSettings} onClassicSettingChange={vi.fn()}
      /> : <p>Another section</p>
    }
    const { rerender } = render(<SectionHarness visible />)
    const user = userEvent.setup()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...original, mappings: [{ ...original.mappings[0], amount: 0 }, ...original.mappings.slice(1)] })
    rerender(<SectionHarness visible={false} />)
    expect(screen.queryByRole('heading', { name: 'Music response' })).not.toBeInTheDocument()
    rerender(<SectionHarness visible />)
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.63)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(1.7)
    expect(onChange).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Reset music settings' }))
    rerender(<SectionHarness visible={false} />)
    rerender(<SectionHarness visible />)
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute('aria-valuetext', '2.3')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
  })

  it.each([
    ['quick', 0.01, 0.12], ['balanced', 0.04, 0.35], ['flowing', 0.2, 1],
  ] as const)('applies the %s timing preset only to the selected movement', async (preset, attack, release) => {
    const original = configWithMappings()
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response style' }), preset)
    expect(onChange).toHaveBeenLastCalledWith({ ...original, mappings: [
      { ...original.mappings[0], attack, release }, ...original.mappings.slice(1),
    ] })
  })

  it('shows arbitrary saved timing as Custom and fine-tunes it without replacing other settings', async () => {
    const original = configWithMappings()
    original.mappings[0] = { ...original.mappings[0], attack: 0.37, release: 2.4 }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.37)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(2.4)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' }), { target: { value: '0.61' } })
    const changed = onChange.mock.lastCall![0] as AudioResponseConfig
    expect(changed.mappings[0]).toEqual({ ...original.mappings[0], attack: 0.61 })
    expect(changed.mappings.slice(1)).toEqual(original.mappings.slice(1))
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' }), { target: { value: '9' } })
    expect(onChange.mock.lastCall![0].mappings[0].release).toBe(5)
  })

  it('opens fine timing when Custom is chosen without changing the saved timing', async () => {
    const onChange = vi.fn()
    render(<ControlledControls onChange={onChange} />)
    expect(screen.queryByRole('slider', { name: 'Rise time' })).not.toBeInTheDocument()
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'custom')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.04)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(0.35)
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(['legacy'] as const)('keeps %s settings inactive until the user changes mode', async (mode) => {
    const onModeChange = vi.fn()
    const onChange = vi.fn()
    render(<ControlledControls mode={mode} onModeChange={onModeChange} onChange={onChange} />)
    const selector = screen.getByRole('combobox', { name: 'Response mode' })
    expect(selector).toHaveValue(mode)
    expect(screen.queryByRole('checkbox', { name: 'Version 2 — Selective' })).not.toBeInTheDocument()
    const options = within(selector).getAllByRole('option') as HTMLOptionElement[]
    expect(options.filter(option => !option.disabled).map(option => [option.textContent, option.value])).toEqual([
      ['Version 1 — Original', 'legacy'], ['Version 2 — Selective', 'mapped-v1'],
    ])
    expect(screen.queryByRole('option', { name: 'Automatic beats' })).not.toBeInTheDocument()
    expect(onModeChange).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(options).toHaveLength(2)
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeVisible()
    expect(screen.queryByRole('slider', { name: 'Hit sensitivity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    await userEvent.setup().selectOptions(selector, 'mapped-v1')
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('mapped-v1')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selects Original from Selective without rewriting the response configuration', async () => {
    const onModeChange = vi.fn()
    const onChange = vi.fn()
    const onClassicSettingChange = vi.fn()
    render(<ControlledControls onModeChange={onModeChange} onChange={onChange} onClassicSettingChange={onClassicSettingChange} />)
    const selector = screen.getByRole('combobox', { name: 'Response mode' })
    expect(selector).toHaveValue('mapped-v1')
    expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual(['Version 1 — Original', 'Version 2 — Selective'])
    expect(screen.queryByRole('option', { name: 'Automatic beats' })).not.toBeInTheDocument()
    await userEvent.setup().selectOptions(selector, 'legacy')
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('legacy')
    expect(onChange).not.toHaveBeenCalled()
    expect(onClassicSettingChange).not.toHaveBeenCalled()
  })

  it('keeps a confirmed fallback selection across unknown and empty capabilities without rewriting saved mappings', async () => {
    const onChange = vi.fn()
    const props = { onChange, supportedTargets: ['size', 'bass'] as MusicResponseControlsProps['supportedTargets'] }
    const { rerender } = render(<ControlledControls {...props} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response target' }), 'bass')
    rerender(<ControlledControls {...props} supportedTargets={['treble']} />)
    expect(screen.queryByRole('heading', { name: 'Treble response' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.queryByRole('combobox', { name: 'Response target' })).not.toBeInTheDocument()
    rerender(<ControlledControls {...props} supportedTargets={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Available inputs will appear when this preview can run.')
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    rerender(<ControlledControls {...props} supportedTargets={[]} />)
    expect(screen.getByRole('status')).toHaveTextContent('This shader has no supported music-response inputs.')
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    rerender(<ControlledControls {...props} supportedTargets={['bass', 'treble']} />)
    expect(screen.getByRole('combobox', { name: 'Response target' })).toHaveValue('treble')
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(0.6)
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(['mage-pulse', 'classic-facebook'])('supports native keyboard controls and reset in %s', async (theme) => {
    document.documentElement.dataset.theme = theme
    const onReset = vi.fn()
    const onChange = vi.fn()
    const { rerender } = render(<ControlledControls supportedTargets={['size']} onReset={onReset} onChange={onChange} />)
    const user = userEvent.setup()
    await user.tab()
    const selector = screen.getByRole('combobox', { name: 'Response mode' })
    expect(selector).toHaveFocus()
    expect(selector).toHaveValue('mapped-v1')
    await user.selectOptions(selector, 'legacy')
    expect(selector).toHaveValue('legacy')
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeVisible()
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    await user.selectOptions(selector, 'mapped-v1')
    expect(selector).toHaveValue('mapped-v1')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveAttribute('aria-valuetext', '0.8')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveFocus()
    const amountInput = screen.getByRole('spinbutton', { name: 'Amount numeric value' })
    await user.click(amountInput)
    await user.keyboard('[ControlLeft>][KeyA][/ControlLeft]0')
    expect(amountInput).toHaveValue(0)
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toBeVisible()
    expect(onChange.mock.lastCall![0].mappings[0]).toEqual({ ...configWithMappings().mappings[0], amount: 0 })
    const reset = screen.getByRole('button', { name: 'Reset music settings' })
    expect(reset).toHaveAccessibleDescription('Restore the music settings this scene started with.')
    reset.focus()
    await user.keyboard('[Enter]')
    expect(onReset).toHaveBeenCalledOnce()
    rerender(<ControlledControls supportedTargets={['size']} onReset={onReset} canReset={false} />)
    expect(screen.getByRole('button', { name: 'Reset music settings' })).toBeDisabled()
  })
})
