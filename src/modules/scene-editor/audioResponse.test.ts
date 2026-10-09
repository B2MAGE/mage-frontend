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
import { buildEffectiveSceneData, prettyPrintEditorSceneData, readEditableSceneData, validateForm } from './utils'

describe('scene audio response persistence', () => {
  it.each(['legacy', 'mapped-v1'] as const)(
    'preserves %s through JSON import, structured edits, export and submission preparation',
    (audioResponse) => {
      const authoredScene = {
        ...createDefaultSceneData(),
        audioResponse,
        visualizer: { shader: 'let motion = input(); sphere(0.5 + size);', skyboxPreset: 4, scale: 2 },
      }
      const importedScene = readEditableSceneData({ schemaVersion: 1, kind: 'custom', scene: authoredScene })
      const model = getSceneEditorModel(importedScene)
      const editedScene = mergeSceneEditorBranch(importedScene, 'intent', {
        ...model.intent,
        time_multiplier: 0.7,
      })
      const exportedScene = prettyPrintEditorSceneData(editedScene)
      const { errors, parsedSceneData } = validateForm('Rhythm scene', exportedScene)

      expect(errors).toEqual({})
      expect(parsedSceneData?.audioResponse).toBe(audioResponse)
      const submittedScene = readEditableSceneData(buildEffectiveSceneData(parsedSceneData!))
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

  it('keeps the response mode in repair data while rejecting retired metadata instead of deleting it', () => {
    const original = {
      ...createDefaultSceneData(),
      audioResponse: 'legacy',
      reactions: { pulse: 1 },
      mageTemplate: 'retired',
    }
    expect(() => buildEffectiveSceneData(original)).toThrow('Unknown field')
    expect(JSON.parse(prettyPrintEditorSceneData(original))).toEqual({ schemaVersion: 1, kind: 'custom', scene: original })
  })
  it.each(['legacy', 'mapped-v1'] as const)('retains explicit mappings even while %s is selected', (mode) => {
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.7, mappings: [
      { target: 'size', source: 'treble-hit', amount: 0.8, attack: 0.02, release: 0.4 },
    ] }).config
    const original: SceneData = { ...createDefaultSceneData(), audioResponse: mode, audioResponseConfig: config }
    const scene = readEditableSceneData(buildEffectiveSceneData(original))
    expect(scene.audioResponseConfig).toEqual(config)
    expect(validateForm('Scene', prettyPrintEditorSceneData(scene)).parsedSceneData?.audioResponseConfig).toEqual(config)
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
    const prepared = readEditableSceneData(buildEffectiveSceneData(original))

    expect(getSceneEditorModel(prepared).intent).toMatchObject({ camOrientationMode: 1, camOrientationSpeed: 0.7 })
    expect(getSceneEditorModel(prepared).state).toEqual(original.state)
  })

})
