import { describe, expect, it } from 'vitest'
import { listSceneTemplates } from '@modules/player'
import { createDefaultSceneData, SHADER_SCENES } from './sceneEditor'
import { changeTemplateSelection, changeTemplateValue, createTemplateScene, getTemplateEditorModel, isTemplateEditorDocument, type TemplateFieldPath } from './templateEditor'
import { buildEffectiveSceneData, buildSceneSubmissionDocument, prettyPrintEditorSceneData, readEditableSceneData, validateForm } from './utils'

describe('template editor documents', () => {
  it('starts with the source-free Prism Core template and explicit settings', () => {
    const scene = createTemplateScene()
    expect(listSceneTemplates().find(item => item.templateId === scene.templateId)?.label).toBe('Prism Core')
    expect(scene).toEqual({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1,
      parameters: { scale: 10, speed: 1 }, settings: { skybox: 6,
        camera: { fov: 75, autoRotate: true, orbitSpeed: 0.2 },
        bloom: { enabled: false, strength: 1, radius: 0.2, threshold: 0.1 },
        tint: { enabled: false, color: '#ffffff' } } })
    expect(scene).not.toHaveProperty('scene')
    expect(scene).not.toHaveProperty('visualizer')
  })

  it.each(listSceneTemplates())('round-trips $label by ID and version without shader source', item => {
    const scene = createTemplateScene(item.templateId)
    const imported = validateForm('Template', prettyPrintEditorSceneData(scene))
    expect(imported.errors).toEqual({})
    expect(buildSceneSubmissionDocument(imported.parsedSceneData!)).toEqual(scene)
    expect(buildEffectiveSceneData(scene)).toEqual(scene)
    expect(scene.templateVersion).toBe(item.templateVersion)
    expect(JSON.stringify(scene)).not.toContain('shader')
  })

  it('retains every supported setting when selecting another template', () => {
    let scene = createTemplateScene()
    const values: Array<[TemplateFieldPath, number | string | boolean]> = [
      ['parameters.scale', 18], ['parameters.speed', 2], ['settings.skybox', 2],
      ['settings.camera.fov', 90], ['settings.camera.autoRotate', false], ['settings.camera.orbitSpeed', 0.7],
      ['settings.bloom.enabled', true], ['settings.bloom.strength', 0.6], ['settings.bloom.radius', 0.4], ['settings.bloom.threshold', 0.3],
      ['settings.tint.enabled', true], ['settings.tint.color', '#12abef'],
    ]
    for (const [path, value] of values) scene = changeTemplateValue(scene, path, value)
    const next = changeTemplateSelection(scene, 'embedded-scene-1')
    expect(next).toEqual({ ...scene, templateId: 'embedded-scene-1' })
    expect(buildSceneSubmissionDocument(next)).toEqual(next)
    expect(validateForm('Edited template', prettyPrintEditorSceneData(next)).parsedSceneData).toEqual(next)
    expect(scene.templateId).toBe('embedded-scene-0')
  })

  it('requires explicit replacement of custom content even when its source matches a template', () => {
    const custom = { ...createDefaultSceneData(), visualizer: { shader: SHADER_SCENES[0].shader, scale: 31 },
      intent: { fov: 120 }, fx: { bloom: { enabled: true, strength: 4 } } }
    expect(changeTemplateSelection(custom, 'embedded-scene-1')).toBe(custom)
    expect(isTemplateEditorDocument(custom)).toBe(false)
    expect(buildSceneSubmissionDocument(custom)).toMatchObject({ kind: 'custom' })
    expect(changeTemplateSelection(custom, 'embedded-scene-1', true)).toEqual(createTemplateScene('embedded-scene-1'))
  })

  it('keeps out-of-range controls repairable while refusing preview and save', () => {
    const scene = changeTemplateValue(createTemplateScene(), 'settings.camera.fov', 200)
    expect(scene.settings.camera.fov).toBe(200)
    expect(isTemplateEditorDocument(scene)).toBe(true)
    expect(getTemplateEditorModel(scene).intent.fov).toBe(200)
    expect(() => buildEffectiveSceneData(scene)).toThrow()
    expect(() => buildSceneSubmissionDocument(scene)).toThrow()
    const repaired = changeTemplateValue(scene, 'settings.camera.fov', 95)
    expect(buildEffectiveSceneData(repaired)).toEqual(repaired)
  })

  it('does not expose unsupported paths or platform shader source in the display model', () => {
    const scene = createTemplateScene()
    expect(() => changeTemplateValue(scene, 'visualizer.shader' as TemplateFieldPath, 'sphere(1)')).toThrow('not supported')
    expect(() => changeTemplateSelection(scene, 'unregistered')).toThrow('library')
    const model = getTemplateEditorModel(scene)
    expect(model.visualizer.shader).toBe('')
    expect(scene).not.toHaveProperty('visualizer')
  })

  it('preserves invalid legacy and custom values for repair without changing their mode', () => {
    const source = { visualizer: { shader: 'sphere(1)' }, intent: { fov: 'broken' }, retained: 'repair me' }
    expect(readEditableSceneData(source)).toEqual(source)
    expect(readEditableSceneData({ schemaVersion: 1, kind: 'custom', scene: source })).toEqual(source)
    expect(isTemplateEditorDocument(source)).toBe(false)
    expect(() => buildSceneSubmissionDocument(source)).toThrow()
  })
})
