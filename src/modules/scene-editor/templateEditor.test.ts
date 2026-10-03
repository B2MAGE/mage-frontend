import { describe, expect, it } from 'vitest'
import { listSceneTemplates } from '@modules/player'
import { createDefaultSceneData, SHADER_SCENES, type SceneEditorModel } from './sceneEditor'
import { changeTemplateBranch, changeTemplateSelection, changeTemplateValue, createTemplateScene, getTemplateEditorModel, isTemplateEditorDocument, type TemplateFieldPath } from './templateEditor'
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

  it('round-trips all prior safe camera, movement, effect, and pass-order settings without copying shader source', () => {
    let scene = createTemplateScene()
    const model = getTemplateEditorModel(scene)
    const edited: SceneEditorModel = {
      controls: { position0: { x: 1, y: 2, z: 3 }, target0: { x: -1, y: -2, z: -3 }, zoom0: 1.5 },
      visualizer: { scale: 42, skyboxPreset: 3, shader: 'untrusted()' },
      intent: { time_multiplier: 2, minimizing_factor: 0.9, power_factor: 2, pointerDownMultiplier: 0.2,
        base_speed: 0.1, easing_speed: 0.5, camTilt: 0.4, camOrientationMode: 1, camOrientationSpeed: 0.7,
        autoRotate: false, autoRotateSpeed: 0.8, fov: 115 },
      state: { currAudio: 0.12, currPointerDown: 0.23, pointerDown: 0.34, size: 0.45, time: 12, volume_multiplier: 0.56 },
      fx: { bloom: { enabled: true, strength: 0.8, radius: 0.3, threshold: 0.2 },
        toneMapping: { method: 4, exposure: 2 },
        passOrder: [model.fx.passOrder[1], model.fx.passOrder[0], ...model.fx.passOrder.slice(2)],
        passes: { ...model.fx.passes, toon: true, rgbShift: true, colorify: true },
        params: { afterImage: { damp: 0.8 }, rgbShift: { amount: 0.006, angle: 0.2 },
          kaleid: { sides: 7, angle: 0.4 }, colorify: { color: '#123abc' } } },
    }
    for (const branch of ['controls', 'visualizer', 'intent', 'state', 'fx'] as const) scene = changeTemplateBranch(scene, branch, edited[branch])
    expect(getTemplateEditorModel(scene)).toEqual({ ...edited, visualizer: { ...edited.visualizer, shader: '' } })
    expect(scene.settings.camera).toMatchObject({ tilt: 0.4, orientationMode: 1, orientationSpeed: 0.7 })
    expect(scene.settings.effects?.passes).not.toHaveProperty('colorify')
    expect(scene.settings.effects?.params).not.toHaveProperty('colorify')
    expect(scene.settings.effects).not.toHaveProperty('bloom')
    expect(JSON.stringify(scene)).not.toContain('untrusted()')
    expect(scene).not.toHaveProperty('scene')
    const reopened = validateForm('Complete template', prettyPrintEditorSceneData(scene))
    expect(reopened.errors).toEqual({})
    expect(reopened.parsedSceneData).toEqual(scene)
    expect(buildSceneSubmissionDocument(reopened.parsedSceneData!)).toEqual(scene)
    expect(buildEffectiveSceneData(scene)).toEqual(scene)
    expect(changeTemplateSelection(scene, 'embedded-scene-4')).toEqual({ ...scene, templateId: 'embedded-scene-4' })
  })

  it('keeps unedited extensions absent and ignores unsupported branch keys', () => {
    const original = createTemplateScene()
    const model = getTemplateEditorModel(original)
    const next = changeTemplateBranch(original, 'intent', { ...model.intent, camTilt: 0.5, code: 'untrusted()' } as SceneEditorModel['intent'])
    expect(next.settings.camera.tilt).toBe(0.5)
    expect(next.settings).not.toHaveProperty('motion')
    expect(next.settings).not.toHaveProperty('state')
    expect(next.settings).not.toHaveProperty('effects')
    expect(JSON.stringify(next)).not.toContain('untrusted')
    const fx = changeTemplateBranch(original, 'fx', { ...model.fx, passes: { ...model.fx.passes, toon: true }, source: 'untrusted()' } as SceneEditorModel['fx'])
    expect(fx.settings.effects).toEqual({ passes: { toon: true } })
  })

  it('retains an invalid extended value while unrelated controls change, then allows direct repair', () => {
    let scene = createTemplateScene()
    const model = getTemplateEditorModel(scene)
    scene = changeTemplateBranch(scene, 'controls', { ...model.controls, zoom0: 0 })
    expect(getTemplateEditorModel(scene).controls.zoom0).toBe(0)
    scene = changeTemplateBranch(scene, 'intent', { ...getTemplateEditorModel(scene).intent, time_multiplier: 2 })
    expect(scene.settings.controls?.zoom0).toBe(0)
    expect(() => buildSceneSubmissionDocument(scene)).toThrow()
    scene = changeTemplateBranch(scene, 'controls', { ...getTemplateEditorModel(scene).controls, zoom0: 1 })
    expect(buildSceneSubmissionDocument(scene)).toEqual(scene)
  })
})
