import { describe, expect, it } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { createBuilderRecipe } from './builderRecipes'
import { builderDesign, builderDesignKey } from './builderDesign'
import { applyBuilderDesign } from './templateWorkspace'
import { createDefaultSceneData, getSceneEditorModel } from './sceneEditor'
import { getBuilderEditorModel } from './builderEditor'

describe('Builder-only reusable designs', () => {
  it('keeps the complete object/group design but excludes scene settings and runtime metadata', () => {
    const scene = createBuilderRecipe('embedded-scene-0')
    const design = builderDesign({ ...scene, name: 'Scene title', selectedAudio: 'private.mp3' } as typeof scene)
    expect(Object.keys(design).sort()).toEqual(['builderVersion', 'composition', 'kind', 'objects', 'rendering', 'schemaVersion'])
    expect(design.objects).toEqual(scene.objects)
    expect(design.composition).toEqual(scene.composition)
    expect(design.rendering).toEqual(scene.rendering)
    design.objects[0].name = 'Independent copy'
    expect(scene.objects[0].name).not.toBe('Independent copy')
  })

  it('preserves camera, effects/pass order, motion, audio response and scene scale when replacing a design', () => {
    const current = createBuilderScene()
    current.parameters = { scale: 7, speed: 1.9 }
    current.settings.camera.fov = 92
    current.settings.skybox = 4
    current.settings.audioResponse = 'mapped-v1'
    current.settings.audioResponseConfig = { version: 1, sensitivity: 0.4, mappings: [] }
    current.settings.motion = { minimizing_factor: .4 }
    current.settings.effects = { passOrder: ['bloom', 'glitchPass', 'outputPass'], passes: { glitch: true } }
    const design = builderDesign(createBuilderRecipe('embedded-scene-5'))
    const loaded = applyBuilderDesign(design, current)
    expect(loaded.settings).toEqual(current.settings)
    expect(loaded.parameters).toEqual(current.parameters)
    expect(builderDesign(loaded)).toEqual(design)
    loaded.settings.camera.fov = 55
    expect(current.settings.camera.fov).toBe(92)
    const before = builderDesignKey(loaded)
    loaded.settings.skybox = 8
    loaded.parameters.scale = 10
    expect(builderDesignKey(loaded)).toBe(before)
    loaded.objects[0].name = 'Changed Builder content'
    expect(builderDesignKey(loaded)).not.toBe(before)
  })

  it('does not discard repairable settings in other sections', () => {
    const current = createBuilderScene()
    current.settings.camera.fov = 999
    const loaded = applyBuilderDesign(builderDesign(createBuilderScene()), current)
    expect(loaded.settings.camera.fov).toBe(999)
  })

  it('preserves supported controls when replacing a custom shader in the owner repair editor', () => {
    const current = createDefaultSceneData()
    const before = getSceneEditorModel(current)
    const loaded = getBuilderEditorModel(applyBuilderDesign(builderDesign(createBuilderScene()), current))
    expect(loaded.controls).toEqual(before.controls)
    expect(loaded.intent).toEqual(before.intent)
    expect(loaded.fx).toEqual(before.fx)
    expect(loaded.visualizer.scale).toBe(before.visualizer.scale)
    expect(loaded.visualizer.skyboxPreset).toBe(before.visualizer.skyboxPreset)
  })
})
