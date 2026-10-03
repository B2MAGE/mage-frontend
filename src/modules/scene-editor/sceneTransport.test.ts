import { describe, expect, it } from 'vitest'
import { parseSceneDocument } from '@modules/player'
import { createDefaultSceneData, SHADER_SCENES } from './sceneEditor'
import { buildEffectiveSceneData, buildSceneSubmissionDocument, prettyPrintEditorSceneData, readEditableSceneData, validateForm } from './utils'

const source = { ...createDefaultSceneData(), visualizer: { shader: 'sphere(0.37)', skyboxPreset: 4 },
  audioResponse: 'legacy', intent: { ...createDefaultSceneData().intent as object, camTilt: 0.2, time_multiplier: 0.75 },
  state: { ...createDefaultSceneData().state as object, volume_multiplier: 0.27 } }
const custom = { schemaVersion: 1, kind: 'custom', scene: source }
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

describe('versioned scene transport compatibility', () => {
  it('wraps existing engine settings as explicit custom data without modifying the original', () => {
    const original = JSON.stringify(source)
    expect(buildSceneSubmissionDocument(source)).toEqual({ schemaVersion: 1, kind: 'custom', scene: source })
    expect(JSON.stringify(source)).toBe(original)
  })

  it('opens and re-saves a custom envelope without nesting another envelope or losing controls', () => {
    expect(readEditableSceneData(custom)).toEqual(source)
    const exported = prettyPrintEditorSceneData(custom)
    const { errors, parsedSceneData } = validateForm('Saved custom scene', exported)
    expect(errors).toEqual({})
    expect(parsedSceneData).not.toHaveProperty('schemaVersion')
    expect(buildSceneSubmissionDocument(parsedSceneData!)).toMatchObject({ schemaVersion: 1, kind: 'custom', scene: {
      visualizer: source.visualizer, audioResponse: 'legacy',
      intent: { camTilt: 0.2, time_multiplier: 0.75 }, state: { volume_multiplier: 0.27 },
    } })
    expect(buildSceneSubmissionDocument(custom)).toEqual(buildSceneSubmissionDocument(source))
  })

  it('accepts explicitly imported custom documents into existing controls', () => {
    const parsed = validateForm('Imported scene', JSON.stringify(custom))
    expect(parsed.errors).toEqual({})
    expect(parsed.parsedSceneData?.visualizer).toMatchObject(source.visualizer)
    expect(parsed.parsedSceneData).not.toHaveProperty('kind')
  })

  it('keeps existing preset shaders custom rather than guessing template identity from source', () => {
    expect(buildSceneSubmissionDocument({ ...source, visualizer: { shader: SHADER_SCENES[0].shader } }))
      .toMatchObject({ schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: SHADER_SCENES[0].shader } } })
  })

  it('preserves valid template transport while keeping template documents out of raw shader controls', () => {
    expect(buildSceneSubmissionDocument(template)).toEqual(parseSceneDocument(template))
    expect(buildSceneSubmissionDocument(template)).not.toHaveProperty('scene')
    expect(() => readEditableSceneData(template)).toThrow('Template scenes are read-only')
    expect(validateForm('Template', JSON.stringify(template)).errors.sceneData).toContain('Template scenes are read-only')
  })

  it.each([
    { schemaVersion: 2, kind: 'custom', scene: source },
    { schemaVersion: 1, kind: 'unknown', scene: source },
    { templateId: 'embedded-scene-0', visualizer: source.visualizer },
    { ...custom, visualizer: source.visualizer },
    { ...template, scene: source },
    { ...custom, scene: { ...template } },
    JSON.parse('{"schemaVersion":1,"kind":"custom","scene":{"__proto__":{"polluted":true}}}'),
  ])('never strips malformed document markers and falls back to custom: %j', invalid => {
    expect(() => buildEffectiveSceneData(invalid)).toThrow()
    expect(() => buildSceneSubmissionDocument(invalid)).toThrow()
    const result = validateForm('Invalid import', JSON.stringify(invalid))
    expect(result.errors.sceneData).toBeTruthy()
    expect(result.parsedSceneData).toBeNull()
  })
})
