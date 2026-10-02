import { describe, expect, it } from 'vitest'
import { normalizeAudioResponseConfig } from '@shared/lib'
import {
  createDefaultSceneData,
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  sanitizeSceneData,
  type SceneData,
} from './sceneEditor'
import { buildEffectiveSceneData, prettyPrintEditorSceneData, validateForm } from './utils'

describe('scene audio response persistence', () => {
  it.each(['transient-v1', 'legacy', 'mapped-v1'] as const)(
    'preserves %s through JSON import, structured edits, export and submission preparation',
    (audioResponse) => {
      const authoredScene = {
        ...createDefaultSceneData(),
        audioResponse,
        visualizer: { shader: 'let motion = input(); sphere(0.5 + size);', skyboxPreset: 4, scale: 2 },
      }
      const importedScene = parseSceneDataJson(JSON.stringify(authoredScene))
      const model = getSceneEditorModel(importedScene)
      const editedScene = mergeSceneEditorBranch(importedScene, 'intent', {
        ...model.intent,
        time_multiplier: 0.7,
      })
      const exportedScene = prettyPrintEditorSceneData(editedScene)
      const { errors, parsedSceneData } = validateForm('Rhythm scene', exportedScene)

      expect(errors).toEqual({})
      expect(parsedSceneData?.audioResponse).toBe(audioResponse)
      const submittedScene = buildEffectiveSceneData(parsedSceneData!)
      expect(submittedScene.audioResponse).toBe(audioResponse)
      expect((submittedScene.visualizer as Record<string, unknown>).shader)
        .toBe(authoredScene.visualizer.shader)
    },
  )

  it('does not add audio response metadata to older or default scenes', () => {
    const legacyScene = createDefaultSceneData()
    expect(sanitizeSceneData(legacyScene)).not.toHaveProperty('audioResponse')
    expect(parseSceneDataJson(prettyPrintEditorSceneData(legacyScene))).not.toHaveProperty('audioResponse')
  })

  it.each([null, 1, true, 'transient-v2', ''])('treats unsupported mode %s as legacy', (audioResponse) => {
    const scene: SceneData = { ...createDefaultSceneData(), audioResponse }
    expect(sanitizeSceneData(scene).audioResponse).toBe('legacy')
  })

  it('preserves the response mode while removing retired reaction-control metadata', () => {
    const scene = buildEffectiveSceneData({
      ...createDefaultSceneData(),
      audioResponse: 'transient-v1',
      reactions: { pulse: 1 },
      mageTemplate: 'retired',
    })

    expect(scene.audioResponse).toBe('transient-v1')
    expect(scene).not.toHaveProperty('reactions')
    expect(scene).not.toHaveProperty('mageTemplate')
  })
  it.each(['legacy', 'transient-v1', 'mapped-v1'] as const)('retains explicit mappings even while %s is selected', (mode) => {
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.7, mappings: [
      { target: 'size', source: 'treble-hit', amount: 0.8, attack: 0.02, release: 0.4 },
    ] }).config
    const original: SceneData = { ...createDefaultSceneData(), audioResponse: mode, audioResponseConfig: config }
    const scene = buildEffectiveSceneData(original)
    expect(scene.audioResponseConfig).toEqual(config)
    expect(parseSceneDataJson(prettyPrintEditorSceneData(scene)).audioResponseConfig).toEqual(config)
    expect(scene.audioResponseConfig).not.toBe(config)
    const { audioResponseConfig: removed, ...withoutConfig } = original
    expect(removed).toEqual(config)
    expect(sanitizeSceneData(withoutConfig)).not.toHaveProperty('audioResponseConfig')
    expect(createDefaultSceneData()).not.toHaveProperty('audioResponseConfig')
  })

  it('preserves authored camera and starting state when preparing a scene for preview and saving', () => {
    const initial = createDefaultSceneData()
    const model = getSceneEditorModel(initial)
    const original = {
      ...initial,
      intent: { ...model.intent, camOrientationMode: 1, camOrientationSpeed: 0.7 },
      state: { ...model.state, size: 0.3, pointerDown: 0.2, currPointerDown: 0.4, currAudio: 0.6, time: 12, volume_multiplier: 0.8 },
    }
    const prepared = buildEffectiveSceneData(original)

    expect(getSceneEditorModel(prepared).intent).toMatchObject({ camOrientationMode: 1, camOrientationSpeed: 0.7 })
    expect(getSceneEditorModel(prepared).state).toEqual(original.state)
  })

})
