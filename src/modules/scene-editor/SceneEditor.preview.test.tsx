import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData, getSceneEditorModel, SHADER_SCENES, type SceneData } from './sceneEditor'
import { buildEffectiveSceneData } from './utils'
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
    expect(screen.getByRole('slider', { name: 'Audio Gain' })).toBeEnabled()
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
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await waitFor(() => expect(created).toBeDefined())
    expect(getSceneEditorModel(created!.sceneData).visualizer.shader).toBe(shaderOption('Ripple Rings').shader)
    expect(created?.sceneData).not.toHaveProperty('reactions')
    expect(created?.sceneData).not.toHaveProperty('mageTemplate')
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
    expect(getSceneEditorModel(updated!.sceneData).visualizer.shader).toBe(source)
    expect(updated?.sceneData).not.toHaveProperty('reactions')
    expect(updated?.sceneData).not.toHaveProperty('mageTemplate')
    expect(updated?.sceneData.otherExtension).toEqual({ preserve: true })
    expect(updated?.sceneData.visualizer).toMatchObject({ customVisualizerSetting: true })
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
    const normalized = buildEffectiveSceneData(original, { isCameraAdvancedEnabled: false, isMotionAdvancedEnabled: false })
    expect(getSceneEditorModel(normalized).visualizer.shader).toBe('sphere(0.71);')
    expect(normalized).not.toHaveProperty('reactions')
    expect(normalized).not.toHaveProperty('mageTemplate')
    expect(normalized.anotherPlugin).toEqual(original.anotherPlugin)
    expect(original).toHaveProperty('reactions')
    expect(original).toHaveProperty('mageTemplate')
  })
})
