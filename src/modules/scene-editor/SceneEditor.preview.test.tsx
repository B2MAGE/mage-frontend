import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, normalizeAudioResponseConfig } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData, getSceneEditorModel, SHADER_SCENES, type SceneData } from './sceneEditor'
import { buildEffectiveSceneData, readEditableSceneData } from './utils'
import {
  buildSceneEditorApiScene,
  mockCreateScenePageFetch,
  renderCreateScenePage,
  renderEditScenePage,
  storeSceneEditorSession,
} from './test-fixtures'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')
  const capture = async () => 'data:image/png;base64,cHJldmlldw=='
  return {
    ...actual,
    MagePlayer: ({ sceneBlob, simulatedBeat, onCaptureFramePreviewChange }: {
      sceneBlob: unknown
      simulatedBeat?: { enabled: boolean; bpm: number }
      onCaptureFramePreviewChange?: (capture: (() => Promise<string | null>) | null) => void
    }) => {
      React.useEffect(() => {
        onCaptureFramePreviewChange?.(capture)
        return () => onCaptureFramePreviewChange?.(null)
      }, [onCaptureFramePreviewChange])
      return <div data-testid="scene-preview" data-scene={JSON.stringify(sceneBlob)} data-beat={JSON.stringify(simulatedBeat)} />
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

type SceneWritePayload = { name: string; sceneData: SceneData }

function previewScene() {
  return JSON.parse(screen.getByTestId('scene-preview').getAttribute('data-scene') ?? '{}') as SceneData
}

function previewBeat() {
  return JSON.parse(screen.getByTestId('scene-preview').getAttribute('data-beat') ?? '{}') as { enabled: boolean; bpm: number }
}

function shaderOption(label: string) {
  const option = SHADER_SCENES.find((candidate) => candidate.label === label)
  if (!option) throw new Error(`Missing shader option ${label}`)
  return option
}

function expectRetiredControlsAbsent() {
  expect(screen.queryByRole('slider', { name: 'Pulse amount' })).not.toBeInTheDocument()
  expect(screen.queryByRole('slider', { name: 'Deformation' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Scene reactions' })).not.toBeInTheDocument()
}

describe('scene editor presets and beat preview', () => {
  it('explains beat detection, hides only bypassed controls, and preserves legacy settings when saving', async () => {
    storeSceneEditorSession()
    const defaults = createDefaultSceneData()
    const saved = {
      ...defaults,
      audioResponse: 'transient-v1',
      intent: {
        ...getSceneEditorModel(defaults).intent,
        minimizing_factor: 1.3, power_factor: 3.4, base_speed: 0.13, easing_speed: 0.44,
      },
      state: { ...getSceneEditorModel(defaults).state, volume_multiplier: 0.27 },
    }
    const scene = buildSceneEditorApiScene({ sceneData: saved, tags: [] })
    let updated: SceneWritePayload | undefined
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/12/tags') && init?.method === 'PUT') return jsonResponse([])
      if (input !== buildApiUrl('/scenes/12')) return
      if (!init?.method || init.method === 'GET') return jsonResponse(scene)
      if (init.method === 'PUT') {
        updated = JSON.parse(String(init.body)) as SceneWritePayload
        return jsonResponse(scene)
      }
    })
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))

    expect(screen.getByText('This scene keeps its saved beat response until you choose a version.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('transient-v1')
    expect(screen.getByRole('option', { name: 'Saved beat response' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'Automatic beats' })).not.toBeInTheDocument()
    expect(previewScene().audioResponse).toBe('transient-v1')
    for (const name of ['Input gain', 'Peak emphasis', 'Resting response', 'Smoothing']) {
      expect(screen.queryByRole('slider', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('spinbutton', { name: 'Animation speed' })).toBeEnabled()
    expect(screen.queryByRole('slider', { name: 'Pointer Release Hold' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Orbit speed' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Animation speed' }), { target: { value: '0.6' } })

    expect(getSceneEditorModel(previewScene()).intent).toMatchObject({ time_multiplier: 0.6, pointerDownMultiplier: getSceneEditorModel(defaults).intent.pointerDownMultiplier })

    await user.click(screen.getByRole('button', { name: 'Show advanced animation controls' }))
    expect(screen.queryByRole('spinbutton', { name: 'Volume Multiplier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Pointer Down' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Starting animation time' })).toBeEnabled()
    expect(getSceneEditorModel(previewScene()).state.volume_multiplier).toBe(0.27)
    await user.click(screen.getByRole('button', { name: 'Hide advanced animation controls' }))
    expect(getSceneEditorModel(previewScene()).state.volume_multiplier).toBe(0.27)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('Audio Response')).toBeInTheDocument()
    expect(screen.getByText('Beat detection')).toBeInTheDocument()
    expect(screen.queryByText('Input gain')).not.toBeInTheDocument()
    expect(screen.queryByText('Peak emphasis')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(updated).toBeDefined())
    expect(readEditableSceneData(updated!.sceneData).audioResponse).toBe('transient-v1')
    expect(getSceneEditorModel(readEditableSceneData(updated!.sceneData)).intent).toMatchObject({
      minimizing_factor: 1.3, power_factor: 3.4, base_speed: 0.13, easing_speed: 0.44,
      time_multiplier: 0.6, pointerDownMultiplier: getSceneEditorModel(defaults).intent.pointerDownMultiplier,
    })
    expect(getSceneEditorModel(readEditableSceneData(updated!.sceneData)).state.volume_multiplier).toBe(0.27)
  })

  it.each(['Rose Circuit', 'Ripple Rings', 'Tidal Lantern'])('keeps %s as an ordinary preset without pulse or deformation controls', async (label) => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage('mage-pulse')
    const before = getSceneEditorModel(previewScene())
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Shader' }), shaderOption(label).id)
    const after = getSceneEditorModel(previewScene())
    expect(after.visualizer.shader).toBe(shaderOption(label).shader)
    expect(after.controls).toEqual(before.controls)
    expect(after.fx).toEqual(before.fx)
    expect(after.visualizer.skyboxPreset).toBe(before.visualizer.skyboxPreset)
    expect(previewScene()).not.toHaveProperty('reactions')
    expect(previewScene()).not.toHaveProperty('mageTemplate')
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expectRetiredControlsAbsent()
    expect(screen.getByRole('slider', { name: 'Input gain' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Simulate beat' })).toBeEnabled()
  })

  it.each(['mage-pulse', 'classic-facebook'] as const)('keeps temporary beat tools in Motion and preserves their state across editor sections in %s', async (theme) => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage(theme)
    const before = previewScene()
    expect(previewBeat()).toMatchObject({ enabled: false })
    expect(screen.queryByRole('checkbox', { name: 'Simulate beat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Tempo' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Motion' }))
    const toggle = screen.getByRole('checkbox', { name: 'Simulate beat' })
    const card = screen.getByRole('region', { name: 'Preview tools' })
    if (!(card instanceof HTMLElement)) throw new Error('Missing simulate beat effect card')
    expect(within(card).getByRole('checkbox', { name: 'Simulate beat' })).toBe(toggle)
    expect(card.closest('aside')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Response mode' }).compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(screen.getByRole('button', { name: 'Reset music settings' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toggle).not.toBeChecked()
    expect(within(card).queryByRole('slider', { name: 'Tempo' })).not.toBeInTheDocument()

    await user.click(toggle)
    const tempoField = within(card).getByRole('slider', { name: 'Tempo' }).closest('.scene-field')
    if (!(tempoField instanceof HTMLElement)) throw new Error('Missing tempo field')
    const tempo = within(tempoField).getByRole('spinbutton', { name: 'Tempo numeric value' })
    fireEvent.change(tempo, { target: { value: '150' } })
    expect(previewBeat()).toEqual({ enabled: true, bpm: 150 })

    await user.click(screen.getByRole('button', { name: 'Effects' }))
    expect(screen.queryByRole('checkbox', { name: 'Simulate beat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Tempo' })).not.toBeInTheDocument()
    expect(previewBeat()).toEqual({ enabled: true, bpm: 150 })
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.getByRole('checkbox', { name: 'Simulate beat' })).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Tempo' })).toHaveValue('150')

    const restoredTempo = screen.getByRole('spinbutton', { name: 'Tempo numeric value' })
    fireEvent.change(restoredTempo, { target: { value: '250' } })
    expect(previewBeat().bpm).toBe(180)
    fireEvent.change(restoredTempo, { target: { value: '20' } })
    expect(previewBeat().bpm).toBe(60)
    await user.click(screen.getByRole('checkbox', { name: 'Simulate beat' }))
    expect(previewBeat()).toEqual({ enabled: false, bpm: 60 })
    expect(screen.queryByRole('slider', { name: 'Tempo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Tempo numeric value' })).not.toBeInTheDocument()
    expect(previewScene()).toEqual(before)
  })

  it('preserves inline animation and camera tuning across sections without an Advanced tab', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage('mage-pulse')
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Animation speed' }), { target: { value: '0.7' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Input gain' }), { target: { value: '1.2' } })
    await user.click(screen.getByRole('button', { name: 'Show advanced animation controls' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Starting animation time' }), { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    await user.click(screen.getByRole('button', { name: 'Show advanced camera controls' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Camera Orientation Speed' }), { target: { value: '2.3' } })
    const before = previewScene()
    await user.click(screen.getByRole('button', { name: 'Hide advanced camera controls' }))
    expect(previewScene()).toEqual(before)
    expect(screen.queryByRole('button', { name: 'Advanced' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset advanced settings' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const exported = JSON.parse((screen.getByRole('textbox', { name: 'Scene Data JSON' }) as HTMLTextAreaElement).value) as SceneData
    const after = getSceneEditorModel(exported)
    expect(after.state.time).toBe(12)
    expect(after.intent.camOrientationSpeed).toBe(2.3)
    expect(after.intent.time_multiplier).toBe(0.7)
    expect(after.intent.minimizing_factor).toBe(1.2)
    expect(previewScene()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.getByRole('spinbutton', { name: 'Starting animation time' })).toHaveValue(12)
    await user.click(screen.getByRole('button', { name: 'Hide advanced animation controls' }))
    expect(previewScene()).toEqual(before)
  })

  it('saves fixed preset source without template, reaction, or simulated preview metadata', async () => {
    storeSceneEditorSession()
    let created: SceneWritePayload | undefined
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes') && init?.method === 'POST') {
        created = JSON.parse(String(init.body)) as SceneWritePayload
        return jsonResponse({ sceneId: 18 }, 201)
      }
    })
    const user = userEvent.setup()
    renderCreateScenePage('mage-pulse')
    await user.type(screen.getByLabelText(/scene name/i), 'Quiet Rings')
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Shader' }), shaderOption('Ripple Rings').id)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    await user.click(screen.getByRole('checkbox', { name: 'Simulate beat' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Tempo' }), { target: { value: '90' } })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await waitFor(() => expect(created).toBeDefined())
    expect(created?.sceneData).toMatchObject({ schemaVersion: 1, kind: 'custom' })
    expect(getSceneEditorModel(readEditableSceneData(created!.sceneData)).visualizer.shader).toBe(shaderOption('Ripple Rings').shader)
    expect(readEditableSceneData(created!.sceneData)).not.toHaveProperty('reactions')
    expect(readEditableSceneData(created!.sceneData)).not.toHaveProperty('mageTemplate')
    expect(JSON.stringify(created)).not.toMatch(/simulatedBeat|previewBpm|isBeatSimulated/)
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('preserves legacy/custom shader text while dropping only retired app metadata during editing and saving', async () => {
    storeSceneEditorSession()
    const source = '// An authored audio response\nlet size = input();\ncolor(0.2, 0.6, 0.8);\nsphere(0.3 + size * 0.7);'
    const saved = {
      ...createDefaultSceneData(),
      visualizer: { shader: source, skyboxPreset: 4, customVisualizerSetting: true },
      reactions: { version: 1, pulse: 1.6, deformation: 0.8 },
      mageTemplate: { id: 'embedded-scene-0', version: 1, parameters: { pulse: 1.2, deformation: 0.6 } },
      otherExtension: { preserve: true },
    }
    const scene = buildSceneEditorApiScene({ sceneData: saved, tags: [] })
    let updated: SceneWritePayload | undefined
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/12/tags') && init?.method === 'PUT') return jsonResponse([])
      if (input !== buildApiUrl('/scenes/12')) return
      if (!init?.method || init.method === 'GET') return jsonResponse(scene)
      if (init.method === 'PUT') {
        updated = JSON.parse(String(init.body)) as SceneWritePayload
        return jsonResponse(scene)
      }
    })
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByRole('combobox', { name: 'Shader' })).toHaveValue('custom')
    expect(screen.getByRole('textbox', { name: 'Custom Shader' })).toHaveValue(source)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expectRetiredControlsAbsent()
    expect(getSceneEditorModel(previewScene()).visualizer.shader).toBe(source)
    expect(previewScene()).not.toHaveProperty('reactions')
    expect(previewScene()).not.toHaveProperty('mageTemplate')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(updated).toBeDefined())
    expect(getSceneEditorModel(readEditableSceneData(updated!.sceneData)).visualizer.shader).toBe(source)
    expect(readEditableSceneData(updated!.sceneData)).not.toHaveProperty('reactions')
    expect(readEditableSceneData(updated!.sceneData)).not.toHaveProperty('mageTemplate')
    expect(readEditableSceneData(updated!.sceneData).otherExtension).toEqual({ preserve: true })
    expect(readEditableSceneData(updated!.sceneData).visualizer).toMatchObject({ customVisualizerSetting: true })
    expect(saved.visualizer.shader).toBe(source)
    expect(saved).toHaveProperty('reactions')
    expect(saved).toHaveProperty('mageTemplate')
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('normalizes old metadata without modifying the original scene or unrelated extension values', () => {
    const original = Object.freeze({
      visualizer: Object.freeze({ shader: 'sphere(0.71);', skyboxPreset: 6 }),
      reactions: Object.freeze({ version: 1, pulse: 1, deformation: 1 }),
      mageTemplate: Object.freeze({ id: 'old-template', version: 1 }),
      anotherPlugin: Object.freeze({ reactions: { pulse: 7 }, mageTemplate: 'unrelated' }),
    })
    const normalized = buildEffectiveSceneData(original)
    expect(getSceneEditorModel(normalized).visualizer.shader).toBe('sphere(0.71);')
    expect(normalized).not.toHaveProperty('reactions')
    expect(normalized).not.toHaveProperty('mageTemplate')
    expect(normalized.anotherPlugin).toEqual(original.anotherPlugin)
    expect(original).toHaveProperty('reactions')
    expect(original).toHaveProperty('mageTemplate')
  })
  it('preserves mapped settings through JSON import, shader selection, mocked create/update requests, and reopening', async () => {
    storeSceneEditorSession()
    const config = normalizeAudioResponseConfig({ sensitivity: 1.7, mappings: [
      { target: 'size', source: 'bass-hit', amount: 0.8, attack: 0.02, release: 0.4 },
      { target: 'treble', source: 'treble-level', amount: 0.5, attack: 0.1, release: 0.2 },
    ] }).config
    let stored: SceneWritePayload | undefined
    const writes: SceneWritePayload[] = []
    mockCreateScenePageFetch((input, init) => {
      const method = init?.method ?? 'GET'
      if ((input === buildApiUrl('/scenes') && method === 'POST') || (input === buildApiUrl('/scenes/12') && method === 'PUT')) {
        stored = JSON.parse(String(init?.body)) as SceneWritePayload
        writes.push(stored)
        return jsonResponse(buildSceneEditorApiScene({ ...stored, tags: [] }), method === 'POST' ? 201 : 200)
      }
      if (input === buildApiUrl('/scenes/12') && method === 'GET') return jsonResponse(buildSceneEditorApiScene({ ...stored, tags: [] }))
      if (input === buildApiUrl('/scenes/12/tags') && method === 'PUT') return jsonResponse([])
    })
    const user = userEvent.setup()
    const create = renderCreateScenePage('mage-pulse')
    await user.type(screen.getByLabelText(/scene name/i), 'Mapped cadence')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const imported = { ...createDefaultSceneData(), audioResponse: 'mapped-v1', audioResponseConfig: config }
    fireEvent.change(screen.getByRole('textbox', { name: 'Scene Data JSON' }), { target: { value: JSON.stringify(imported) } })
    await user.click(screen.getByRole('button', { name: 'Format JSON' }))
    expect(JSON.parse((screen.getByRole('textbox', { name: 'Scene Data JSON' }) as HTMLTextAreaElement).value).audioResponseConfig).toEqual(config)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Shader' }), shaderOption('Ripple Rings').id)
    expect(previewScene().audioResponseConfig).toEqual(config)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await screen.findByText('My Scenes')
    expect(writes[0].sceneData).toMatchObject({ schemaVersion: 1, kind: 'custom', scene: { audioResponse: 'mapped-v1', audioResponseConfig: config } })
    create.unmount()

    const edit = renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    expect(previewScene().audioResponseConfig).toEqual(config)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Shader' }), shaderOption('Tidal Lantern').id)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.getByRole('combobox', { name: 'Response mode' })).toHaveValue('mapped-v1')
    expect(screen.queryByRole('slider', { name: 'Input gain' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Animation speed' }), { target: { value: '0.75' } })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const updatedConfig = { ...config, sensitivity: 2.1 }
    const exported = JSON.parse((screen.getByRole('textbox', { name: 'Scene Data JSON' }) as HTMLTextAreaElement).value) as SceneData
    expect(exported.audioResponseConfig).toEqual(config)
    fireEvent.change(screen.getByRole('textbox', { name: 'Scene Data JSON' }), {
      target: { value: JSON.stringify({ ...exported, audioResponseConfig: updatedConfig }) },
    })
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await screen.findByText('My Scenes')
    expect(writes[1].sceneData).toMatchObject({ schemaVersion: 1, kind: 'custom', scene: { audioResponse: 'mapped-v1', audioResponseConfig: updatedConfig } })
    expect(getSceneEditorModel(readEditableSceneData(writes[1].sceneData)).visualizer.shader).toBe(shaderOption('Tidal Lantern').shader)
    expect(getSceneEditorModel(readEditableSceneData(writes[1].sceneData)).intent.time_multiplier).toBe(0.75)
    edit.unmount()

    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    expect(previewScene()).toMatchObject({ audioResponse: 'mapped-v1', audioResponseConfig: updatedConfig })
    expect(getSceneEditorModel(previewScene()).visualizer.shader).toBe(shaderOption('Tidal Lantern').shader)
    expect(JSON.stringify(writes)).not.toMatch(/effectiveConfig|savedConfig|audioResponseOverride/)
  })

})

// These editor workflows exercise fields/submission with explicit playback permission.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
