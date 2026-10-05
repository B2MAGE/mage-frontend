import { describe, expect, it } from 'vitest'
import type { MagePlayerAudioResponseCapabilitiesSnapshot } from '@modules/player'
import type { AudioResponseTarget } from '@shared/lib'
import { supportedPreviewAudioTargets } from './musicResponseCapabilities'
import { createDefaultSceneData, getSceneEditorModel, type SceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'

function snapshot(sceneBlob: SceneData, supportedTargets: AudioResponseTarget[]): MagePlayerAudioResponseCapabilitiesSnapshot {
  return { sceneBlob, capabilities: {
    mode: 'mapped-v1', signals: [], targets: supportedTargets, supportedTargets, unsupportedTargets: [], warnings: [],
  } }
}

describe('editor music-response capability ownership', () => {
  it('keeps unknown capabilities distinct from confirmed empty, single and multiple supported inputs', () => {
    const scene = createDefaultSceneData()
    expect(supportedPreviewAudioTargets(null, scene, scene)).toBeNull()
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), null, scene)).toBeNull()
    for (const targets of [[], ['size'], ['bass', 'audioHit']] satisfies AudioResponseTarget[][]) {
      expect(supportedPreviewAudioTargets(snapshot(scene, targets), scene, scene)).toEqual(targets)
    }
  })

  it('retains the compiled list across response edits without deriving support from saved mappings', () => {
    const scene = createDefaultSceneData()
    const edited = { ...scene, audioResponse: 'mapped-v1', audioResponseConfig: {
      version: 1, sensitivity: 1.7, mappings: [{ target: 'treble', source: 'treble-hit', amount: 2.1, attack: 0.13, release: 0.8 }],
    } }
    const before = structuredClone(edited)
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), edited, edited)).toEqual(['size'])
    expect(edited).toEqual(before)
  })

  it('rejects the prior shader and prior structural revision even when they have the same saved mappings', () => {
    const scene = createDefaultSceneData()
    const model = getSceneEditorModel(scene)
    const replacement = { ...scene, visualizer: { ...model.visualizer, shader: 'sphere(0.5)' } }
    const differentState = { ...scene, state: { ...model.state, time: 12 } }
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), replacement, replacement)).toBeNull()
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), differentState, differentState)).toBeNull()
    expect(supportedPreviewAudioTargets(snapshot(replacement, ['bass']), replacement, replacement)).toEqual(['bass'])
  })

  it('keeps repair controls for the same source but rejects changed source in an invalid draft', () => {
    const scene = createDefaultSceneData()
    const model = getSceneEditorModel(scene)
    const draft = { ...scene, audioResponse: 'mapped-v1', audioResponseConfig: {
      version: 1, sensitivity: 9, mappings: [{ target: 'size', source: 'overall-hit', amount: 8 }],
    } }
    const before = structuredClone(draft)
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, draft)).toEqual(['size'])
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, {
      ...draft, visualizer: { ...model.visualizer, shader: 'sphere(' },
    })).toBeNull()
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, {
      ...draft, visualizer: { ...model.visualizer, shader: null },
    })).toBeNull()
    expect(draft).toEqual(before)
  })

  it('matches template identity while allowing invalid same-template controls to be repaired', () => {
    const scene = createTemplateScene()
    const draft = { ...scene, parameters: { ...scene.parameters, scale: 1000 } }
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, draft)).toEqual(['size'])
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, {
      ...draft, templateId: 'embedded-scene-1',
    })).toBeNull()
    expect(supportedPreviewAudioTargets(snapshot(scene, ['size']), scene, {
      ...draft, templateVersion: 2,
    })).toBeNull()
  })

  it('supports the same custom source in an editor envelope but rejects malformed document identity', () => {
    const scene = createDefaultSceneData()
    const compiled = snapshot(scene, ['bass'])
    expect(supportedPreviewAudioTargets(compiled, scene, { schemaVersion: 1, kind: 'custom', scene })).toEqual(['bass'])
    expect(supportedPreviewAudioTargets(compiled, scene, { schemaVersion: 2, kind: 'custom', scene })).toBeNull()
    expect(supportedPreviewAudioTargets(compiled, scene, { ...scene, kind: 'unknown' })).toBeNull()
  })
})
