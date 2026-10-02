import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, normalizeAudioResponseConfig } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData, getSceneEditorModel, type SceneData } from './sceneEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('@modules/player', async importOriginal => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')
  const capture = async () => 'data:image/png;base64,cHJldmlldw=='
  return {
    ...actual,
    MagePlayer: ({ sceneBlob, onAudioResponseCapabilitiesChange, onCaptureFramePreviewChange }: import('@modules/player').MagePlayerProps) => {
      React.useEffect(() => {
        onCaptureFramePreviewChange?.(capture)
        return () => onCaptureFramePreviewChange?.(null)
      }, [onCaptureFramePreviewChange])
      React.useEffect(() => {
        onAudioResponseCapabilitiesChange?.(sceneBlob ? {
          sceneBlob,
          capabilities: { mode: 'mapped-v1', signals: ['bass-hit', 'mid-level'], targets: ['size'], supportedTargets: ['size'], unsupportedTargets: [], warnings: [] },
        } : null)
      }, [sceneBlob, onAudioResponseCapabilitiesChange])
      return <div data-testid="music-preview" data-scene={JSON.stringify(sceneBlob)} />
    },
  }
})

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })
function preview() { return JSON.parse(screen.getByTestId('music-preview').getAttribute('data-scene') ?? '{}') as SceneData }

describe('creator music response workflow', () => {
  it.each(['mage-pulse', 'classic-facebook'] as const)('edits the live preview and resets only music settings in %s', async theme => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    renderCreateScenePage(theme)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(preview()).not.toHaveProperty('audioResponse')
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('legacy')
    expect(screen.queryByRole('checkbox', { name: 'Version 2 — Selective' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Automatic beats' })).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeEnabled()
    const originalInputGain = getSceneEditorModel(preview()).intent.minimizing_factor
    fireEvent.change(screen.getByRole('slider', { name: 'Input gain' }), { target: { value: '0.77' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Animation speed' }), { target: { value: '0.6' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Frequency focus' }), 'bass')
    fireEvent.change(screen.getByRole('slider', { name: 'Hit sensitivity' }), { target: { value: '1.7' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'level')
    expect(screen.queryByRole('slider', { name: 'Hit sensitivity' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '2.4' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response style' }), 'flowing')
    expect(preview()).toMatchObject({
      audioResponse: 'mapped-v1',
      audioResponseConfig: { version: 1, sensitivity: 1.7, mappings: [{ target: 'size', source: 'bass-level', amount: 2.4, attack: 0.2, release: 1 }] },
    })
    expect(screen.queryByRole('slider', { name: 'Input gain' })).not.toBeInTheDocument()
    const edited = preview().audioResponseConfig
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '0' } })
    expect(preview().audioResponseConfig).toMatchObject({ mappings: [
      { target: 'size', source: 'bass-level', amount: 0, attack: 0.2, release: 1 },
    ] })
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.getByRole('slider', { name: 'Amount' })).toHaveValue('0')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '2.4' } })
    expect(preview().audioResponseConfig).toEqual(edited)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'legacy')
    expect(preview().audioResponse).toBe('legacy')
    expect(preview().audioResponseConfig).toEqual(edited)
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Input gain' })).toHaveValue('0.77')
    fireEvent.change(screen.getByRole('slider', { name: 'Input gain' }), { target: { value: '1.2' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    expect(preview().audioResponse).toBe('mapped-v1')
    expect(preview().audioResponseConfig).toEqual(edited)
    expect(getSceneEditorModel(preview()).intent.minimizing_factor).toBe(1.2)
    await user.click(screen.getByRole('button', { name: 'Reset music settings' }))
    expect(preview()).not.toHaveProperty('audioResponse')
    expect(preview()).not.toHaveProperty('audioResponseConfig')
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('legacy')
    expect(getSceneEditorModel(preview()).intent.minimizing_factor).toBe(originalInputGain)
    expect(getSceneEditorModel(preview()).intent.time_multiplier).toBe(0.6)
    expect(screen.getByRole('button', { name: 'Reset music settings' })).toBeDisabled()
  })

  it.each([0, 0.0123456789, 2.1])('saves tuned settings with amount %s, reopens them, and resets to the saved scene configuration', async amount => {
    storeSceneEditorSession()
    const startingConfig = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.2, mappings: [
      { target: 'size', source: 'treble-hit', amount: 0.8, attack: 0.13, release: 0.73 },
      { target: 'mid', source: 'mid-level', amount: 1.4, attack: 0.2, release: 0.5 },
    ] }).config
    let stored = { ...createDefaultSceneData(), audioResponse: 'mapped-v1', audioResponseConfig: startingConfig }
    let submitted: SceneData | undefined
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/12/tags') && init?.method === 'PUT') return jsonResponse([])
      if (input !== buildApiUrl('/scenes/12')) return
      if (init?.method === 'PUT') {
        submitted = (JSON.parse(String(init.body)) as { sceneData: SceneData }).sceneData
        stored = submitted as typeof stored
      }
      return jsonResponse(buildSceneEditorApiScene({ sceneData: stored, tags: [] }))
    })
    const user = userEvent.setup()
    const first = renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(await screen.findByRole('combobox', { name: 'Response style' })).toHaveValue('custom')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: String(amount) } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency focus' }), 'mid')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(submitted).toBeDefined())
    expect(submitted).toMatchObject({ audioResponse: 'mapped-v1', audioResponseConfig: {
      sensitivity: 1.2, mappings: [
        { target: 'size', source: 'mid-hit', amount, attack: 0.13, release: 0.73 },
        startingConfig.mappings[1],
      ],
    } })
    first.unmount()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(await screen.findByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(amount)
    expect(screen.getByRole('combobox', { name: 'Frequency focus' })).toHaveValue('mid')
    expect(screen.getByRole('slider', { name: 'Rise time' })).toHaveValue('0.13')
    expect(screen.getByRole('slider', { name: 'Fade time' })).toHaveValue('0.73')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '3' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'legacy')
    expect(preview().audioResponse).toBe('legacy')
    expect(preview().audioResponseConfig).toMatchObject({ mappings: [{ ...startingConfig.mappings[0], source: 'mid-hit', amount: 3 }, startingConfig.mappings[1]] })
    await user.click(screen.getByRole('button', { name: 'Reset music settings' }))
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('mapped-v1')
    expect(preview().audioResponse).toBe('mapped-v1')
    expect(preview().audioResponseConfig).toEqual(stored.audioResponseConfig)
  })

  it('preserves a saved beat response until a deliberate version switch and restores it on reset', async () => {
    storeSceneEditorSession()
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.9, mappings: [
      { target: 'size', source: 'bass-hit', amount: 1.4, attack: 0.23, release: 0.87 },
    ] }).config
    const stored = { ...createDefaultSceneData(), audioResponse: 'transient-v1', audioResponseConfig: config }
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: stored, tags: [] })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(preview()).toMatchObject({ audioResponse: 'transient-v1', audioResponseConfig: config })
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('transient-v1')
    expect(screen.getByRole('option', { name: 'Saved beat response' })).toBeDisabled()
    expect(screen.getByText('This scene keeps its saved beat response until you choose a version.')).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Input gain' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset music settings' })).toBeDisabled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    expect(preview()).toMatchObject({ audioResponse: 'mapped-v1', audioResponseConfig: config })
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(1.4)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'legacy')
    expect(preview()).toMatchObject({ audioResponse: 'legacy', audioResponseConfig: config })
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reset music settings' }))
    expect(preview()).toMatchObject({ audioResponse: 'transient-v1', audioResponseConfig: config })
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('transient-v1')
    expect(screen.queryByRole('slider', { name: 'Input gain' })).not.toBeInTheDocument()
  })
})
