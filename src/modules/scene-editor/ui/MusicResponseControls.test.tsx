import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeAudioResponseConfig, type AudioResponseConfig } from '@shared/lib'
import { MusicResponseControls, type MusicResponseControlsProps } from './MusicResponseControls'

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
  return <MusicResponseControls
    mode="mapped-v1" config={config} supportedTargets={['size', 'bass']}
    onModeChange={vi.fn()} onReset={vi.fn()} canReset
    onConfigChange={(next) => { setConfig(next); onChange(next) }}
    {...props}
  />
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('MusicResponseControls', () => {
  it('updates frequency and follow independently while preserving every other mapping', async () => {
    const onChange = vi.fn()
    const original = configWithMappings()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Music response', level: 3 })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Movement' })).getAllByRole('option').map((option) => option.textContent))
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'bass')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('bass')
    expect(screen.getByRole('combobox', { name: 'Follow' })).toHaveValue('level')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('1.2')
  })

  it('keeps an unmapped movement off until enabled and preserves unsupported mappings', async () => {
    const original = configWithMappings()
    const disabledConfig = { ...original, mappings: original.mappings.filter((mapping) => mapping.target !== 'size') }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={disabledConfig} supportedTargets={['size']} onChange={onChange} />)
    expect(screen.getByRole('heading', { name: 'Size', level: 4 })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Movement' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'React to music' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Amount' })).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(screen.getByRole('checkbox', { name: 'React to music' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toBeEnabled()
    expect(onChange.mock.lastCall![0].mappings).toEqual([
      ...disabledConfig.mappings,
      { target: 'size', source: 'overall-hit', amount: 1, attack: 0.04, release: 0.35 },
    ])
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onChange).toHaveBeenLastCalledWith(disabledConfig)
  })

  it('keeps sensitivity global and amount local, with bounded numeric inputs', () => {
    const onChange = vi.fn()
    const original = configWithMappings()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sensitivity numeric value' }), { target: { value: '2.5' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...original, sensitivity: 2.5 })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '99' } })
    const changed = onChange.mock.lastCall![0] as AudioResponseConfig
    expect(changed.sensitivity).toBe(2.5)
    expect(changed.mappings[0].amount).toBe(4)
    expect(changed.mappings.slice(1)).toEqual(original.mappings.slice(1))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Sensitivity numeric value' }), { target: { value: '0' } })
    expect(onChange.mock.lastCall![0].sensitivity).toBe(0.1)
    expect(screen.getByText(/does not change music volume or movement strength/i)).toBeInTheDocument()
  })

  it('restores each disabled movement’s tuned settings and clears its draft on reset', async () => {
    const original = configWithMappings()
    original.mappings[0] = { target: 'size', source: 'mid-level', amount: 2.1, attack: 0.37, release: 1.8 }
    const onChange = vi.fn()
    const onReset = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} onReset={onReset} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onChange.mock.lastCall![0].mappings).toEqual(original.mappings.slice(1))
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('mid')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('2.1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'bass')
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'size')
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onChange.mock.lastCall![0].mappings.find((mapping: { target: string }) => mapping.target === 'size')).toEqual(original.mappings[0])
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'bass')
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onChange.mock.lastCall![0].mappings.find((mapping: { target: string }) => mapping.target === 'bass')).toEqual(original.mappings[1])
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    await user.click(screen.getByRole('button', { name: 'Reset to scene defaults' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox', { name: 'React to music' })).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onChange.mock.lastCall![0].mappings.find((mapping: { target: string }) => mapping.target === 'bass')).toEqual({
      target: 'bass', source: 'bass-level', amount: 1, attack: 0.04, release: 0.35,
    })
  })

  it('retains controlled drafts across section unmounts and clears them through the reset callback', async () => {
    const original = configWithMappings()
    original.mappings[0] = { target: 'size', source: 'treble-level', amount: 2.3, attack: 0.63, release: 1.7 }
    const onDraftsChange = vi.fn()
    function SectionHarness({ visible }: { visible: boolean }) {
      const [config, setConfig] = useState(original)
      const [drafts, setDrafts] = useState<NonNullable<MusicResponseControlsProps['disabledMappingDrafts']>>({})
      return visible ? <MusicResponseControls
        mode="mapped-v1" config={config} supportedTargets={['size']}
        onModeChange={vi.fn()} onConfigChange={setConfig} canReset onReset={vi.fn()}
        disabledMappingDrafts={drafts}
        onDisabledMappingDraftsChange={(next) => { setDrafts(next); onDraftsChange(next) }}
      /> : <p>Another section</p>
    }
    const { rerender } = render(<SectionHarness visible />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(onDraftsChange).toHaveBeenLastCalledWith({ size: original.mappings[0] })
    rerender(<SectionHarness visible={false} />)
    expect(screen.queryByRole('heading', { name: 'Music response' })).not.toBeInTheDocument()
    rerender(<SectionHarness visible />)
    expect(screen.getByRole('checkbox', { name: 'React to music' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('2.3')
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    await user.click(screen.getByText('Fine-tune response'))
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.63)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(1.7)
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    await user.click(screen.getByRole('button', { name: 'Reset to scene defaults' }))
    expect(onDraftsChange).toHaveBeenLastCalledWith({})
    rerender(<SectionHarness visible={false} />)
    rerender(<SectionHarness visible />)
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('1')
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('overall')
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('balanced')
  })

  it.each([
    ['quick', 0.01, 0.12], ['balanced', 0.04, 0.35], ['flowing', 0.2, 1],
  ] as const)('applies the %s timing preset only to the selected movement', async (preset, attack, release) => {
    const original = configWithMappings()
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response' }), preset)
    expect(onChange).toHaveBeenLastCalledWith({ ...original, mappings: [
      { ...original.mappings[0], attack, release }, ...original.mappings.slice(1),
    ] })
  })

  it('shows arbitrary saved timing as Custom and fine-tunes it without replacing other settings', async () => {
    const original = configWithMappings()
    original.mappings[0] = { ...original.mappings[0], attack: 0.37, release: 2.4 }
    const onChange = vi.fn()
    render(<ControlledControls initialConfig={original} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    expect(onChange).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByText('Fine-tune response'))
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.37)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(2.4)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' }), { target: { value: '0.61' } })
    const changed = onChange.mock.lastCall![0] as AudioResponseConfig
    expect(changed.mappings[0]).toEqual({ ...original.mappings[0], attack: 0.61 })
    expect(changed.mappings.slice(1)).toEqual(original.mappings.slice(1))
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' }), { target: { value: '9' } })
    expect(onChange.mock.lastCall![0].mappings[0].release).toBe(5)
  })

  it('opens fine timing when Custom is chosen without changing the saved timing', async () => {
    const onChange = vi.fn()
    render(<ControlledControls onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response' }), 'custom')
    expect(screen.getByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    expect(screen.getByRole('spinbutton', { name: 'Rise time numeric value (seconds)' })).toHaveValue(0.04)
    expect(screen.getByRole('spinbutton', { name: 'Fade time numeric value (seconds)' })).toHaveValue(0.35)
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(['legacy', 'transient-v1'] as const)('keeps %s settings inactive until the user changes mode', async (mode) => {
    const onModeChange = vi.fn()
    const onChange = vi.fn()
    render(<ControlledControls mode={mode} onModeChange={onModeChange} onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue(mode)
    expect(screen.queryByRole('slider', { name: 'Sensitivity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('mapped-v1')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('falls back immediately when capabilities change and distinguishes waiting from unavailable', async () => {
    const onChange = vi.fn()
    const props = { onChange, supportedTargets: ['size', 'bass'] as MusicResponseControlsProps['supportedTargets'] }
    const { rerender } = render(<ControlledControls {...props} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Movement' }), 'bass')
    rerender(<ControlledControls {...props} supportedTargets={['treble']} />)
    expect(screen.getByRole('heading', { name: 'Treble response', level: 4 })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('treble')
    expect(screen.queryByRole('combobox', { name: 'Movement' })).not.toBeInTheDocument()
    rerender(<ControlledControls {...props} supportedTargets={null} />)
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for the preview/i)
    expect(screen.queryByRole('checkbox', { name: 'React to music' })).not.toBeInTheDocument()
    rerender(<ControlledControls {...props} supportedTargets={[]} />)
    expect(screen.getByRole('status')).toHaveTextContent(/no movements available/i)
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each(['mage-pulse', 'classic-facebook'])('supports native keyboard controls and reset in %s', async (theme) => {
    document.documentElement.dataset.theme = theme
    const onReset = vi.fn()
    const onChange = vi.fn()
    const { rerender } = render(<ControlledControls supportedTargets={['size']} onReset={onReset} onChange={onChange} />)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveFocus()
    const toggle = screen.getByRole('checkbox', { name: 'React to music' })
    toggle.focus()
    await user.keyboard('[Space]')
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toBeDisabled()
    await user.keyboard('[Space]')
    expect(toggle).toBeChecked()
    const reset = screen.getByRole('button', { name: 'Reset to scene defaults' })
    expect(reset).toHaveAccessibleDescription('Restore the music settings this scene started with.')
    reset.focus()
    await user.keyboard('[Enter]')
    expect(onReset).toHaveBeenCalledOnce()
    rerender(<ControlledControls supportedTargets={['size']} onReset={onReset} canReset={false} />)
    expect(screen.getByRole('button', { name: 'Reset to scene defaults' })).toBeDisabled()
  })
})
