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
      for (const advancedEnabled of [false, true]) {
        const submittedScene = buildEffectiveSceneData(parsedSceneData!, {
          isCameraAdvancedEnabled: advancedEnabled,
          isMotionAdvancedEnabled: advancedEnabled,
        })
        expect(submittedScene.audioResponse).toBe(audioResponse)
        expect((submittedScene.visualizer as Record<string, unknown>).shader)
          .toBe(authoredScene.visualizer.shader)
      }
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
    }, { isCameraAdvancedEnabled: true, isMotionAdvancedEnabled: true })

    expect(scene.audioResponse).toBe('transient-v1')
    expect(scene).not.toHaveProperty('reactions')
    expect(scene).not.toHaveProperty('mageTemplate')
  })
  it.each(['legacy', 'transient-v1', 'mapped-v1'] as const)('retains explicit mappings even while %s is selected', (mode) => {
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.7, mappings: [
      { target: 'size', source: 'treble-hit', amount: 0.8, attack: 0.02, release: 0.4 },
    ] }).config
    const original: SceneData = { ...createDefaultSceneData(), audioResponse: mode, audioResponseConfig: config }
    for (const enabled of [false, true]) {
      const scene = buildEffectiveSceneData(original, { isCameraAdvancedEnabled: enabled, isMotionAdvancedEnabled: enabled })
      expect(scene.audioResponseConfig).toEqual(config)
      expect(parseSceneDataJson(prettyPrintEditorSceneData(scene)).audioResponseConfig).toEqual(config)
      expect(scene.audioResponseConfig).not.toBe(config)
    }
    const { audioResponseConfig: removed, ...withoutConfig } = original
    expect(removed).toEqual(config)
    expect(sanitizeSceneData(withoutConfig)).not.toHaveProperty('audioResponseConfig')
    expect(createDefaultSceneData()).not.toHaveProperty('audioResponseConfig')
  })

})
