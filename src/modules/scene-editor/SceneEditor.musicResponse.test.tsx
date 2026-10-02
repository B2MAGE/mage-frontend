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
    expect(screen.getByRole('slider', { name: 'Audio Gain' })).toBeEnabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Time Multiplier' }), { target: { value: '0.6' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Frequency focus' }), 'bass')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'level')
    fireEvent.change(screen.getByRole('slider', { name: 'Sensitivity' }), { target: { value: '1.7' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Amount' }), { target: { value: '2.4' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response' }), 'flowing')
    expect(preview()).toMatchObject({
      audioResponse: 'mapped-v1',
      audioResponseConfig: { version: 1, sensitivity: 1.7, mappings: [{ target: 'size', source: 'bass-level', amount: 2.4, attack: 0.2, release: 1 }] },
    })
    expect(screen.queryByRole('slider', { name: 'Audio Gain' })).not.toBeInTheDocument()
    const edited = preview().audioResponseConfig
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(preview().audioResponseConfig).toMatchObject({ mappings: [] })
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    await user.click(screen.getByRole('checkbox', { name: 'React to music' }))
    expect(preview().audioResponseConfig).toEqual(edited)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'legacy')
    expect(screen.getByRole('slider', { name: 'Audio Gain' })).toBeEnabled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response mode' }), 'mapped-v1')
    expect(preview().audioResponseConfig).toEqual(edited)
    await user.click(screen.getByRole('button', { name: 'Reset to scene defaults' }))
    expect(preview()).not.toHaveProperty('audioResponse')
    expect(preview()).not.toHaveProperty('audioResponseConfig')
    expect(getSceneEditorModel(preview()).intent.time_multiplier).toBe(0.6)
    expect(screen.getByRole('button', { name: 'Reset to scene defaults' })).toBeDisabled()
  })

  it('saves tuned settings, reopens them, and resets to the saved scene configuration', async () => {
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
    expect(await screen.findByRole('combobox', { name: 'Response' })).toHaveValue('custom')
    fireEvent.change(screen.getByRole('slider', { name: 'Amount' }), { target: { value: '2.1' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Frequency focus' }), 'mid')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(submitted).toBeDefined())
    expect(submitted).toMatchObject({ audioResponse: 'mapped-v1', audioResponseConfig: {
      sensitivity: 1.2, mappings: [
        { target: 'size', source: 'mid-hit', amount: 2.1, attack: 0.13, release: 0.73 },
        startingConfig.mappings[1],
      ],
    } })
    first.unmount()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(await screen.findByRole('slider', { name: 'Amount' })).toHaveValue('2.1')
    fireEvent.change(screen.getByRole('slider', { name: 'Amount' }), { target: { value: '0' } })
    await user.click(screen.getByRole('button', { name: 'Reset to scene defaults' }))
    expect(preview().audioResponseConfig).toEqual(stored.audioResponseConfig)
  })
})
