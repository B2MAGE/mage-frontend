import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { parseSceneDocument, type TemplateId } from '../player/templates/sceneContract'
import { SCENE_LIMITS, validateSceneForPlayback, validateSceneForStorage } from '../player/policy/sceneValidation'
import { defaultDriverPreset, readDriverPreset } from './builderDrivers'
import { BUILDER_RECIPES, builderRecipeReference, createBuilderRecipe } from './builderRecipes'
import { getTemplateEditorModel } from './templateEditor'

function fullyEditedSettings(templateId: TemplateId) {
  const scene = createBuilderRecipe(templateId)
  const model = getTemplateEditorModel(scene)
  const passes = { ...model.fx.passes }
  delete (passes as Partial<typeof passes>).colorify
  const params = { afterImage: model.fx.params.afterImage, rgbShift: model.fx.params.rgbShift, kaleid: model.fx.params.kaleid }
  const mappings = (['size', 'bass', 'mid', 'treble', 'audioLevel', 'audioHit'] as const).map(target => ({
    target, source: 'bass-level' as const, amount: 1, attack: .02, release: .2,
  }))
  return {
    ...scene.settings,
    controls: structuredClone(model.controls),
    camera: { ...scene.settings.camera, tilt: model.intent.camTilt, orientationMode: model.intent.camOrientationMode, orientationSpeed: model.intent.camOrientationSpeed },
    motion: { minimizing_factor: model.intent.minimizing_factor, power_factor: model.intent.power_factor,
      pointerDownMultiplier: model.intent.pointerDownMultiplier, base_speed: model.intent.base_speed, easing_speed: model.intent.easing_speed },
    state: { ...model.state, currPointerDown: 0 },
    effects: { passOrder: model.fx.passOrder, toneMapping: model.fx.toneMapping, passes, params },
    audioResponse: 'mapped-v1' as const,
    audioResponseConfig: { version: 1 as const, sensitivity: 1, mappings },
  }
}

function objectFieldCount(value: unknown): number {
  return value && typeof value === 'object'
    ? (Array.isArray(value) ? 0 : Object.keys(value).length) + Object.values(value).reduce<number>((count, item) => count + objectFieldCount(item), 0)
    : 0
}

const references = [
  { id: 'embedded-scene-1', types: ['lattice', 'box-frame', 'box-frame', 'box-frame'], color: '#6e7e7b', metal: .5870582642599769, shine: .6708057727257557, ray: 1.2506225601940093, blend: .22812291319767167 },
  { id: 'embedded-scene-3', types: ['box-frame', 'box-frame', 'lattice'], color: '#267910', metal: .6434036988763767, shine: .34486068234140727, ray: 2.9789122078821793, blend: .25980941491680876 },
  { id: 'embedded-scene-6', types: ['sphere', 'cylinder', 'lattice', 'lattice'], color: '#f31b00', metal: .7125574975041655, shine: .5774589834819871, ray: 2.1969051528600634, blend: .22861033952631743 },
  { id: 'embedded-scene-7', types: ['lattice', 'lattice', 'sphere', 'sphere'], color: '#1d0277', metal: .5711799571404537, shine: .5590513531439385, ray: 2.0857194147559914, blend: .1017060511129565 },
  { id: 'embedded-scene-8', types: ['torus', 'lattice', 'box-frame', 'lattice', 'sphere', 'lattice'], color: '#67c673', metal: .6607251320316083, shine: .6646852498948923, ray: 1.4049960809220177, blend: .19517422836065718 },
  { id: 'embedded-scene-9', types: ['box-frame', 'lattice', 'sphere'], color: '#ff4d00', metal: .4757753414424941, shine: .4905478148343774, ray: 2.7452866417099218, blend: .10155951925016898 },
  { id: 'embedded-scene-10', types: ['torus', 'box-frame', 'lattice'], color: '#32e93f', metal: .31594207653292694, shine: .3832572948846391, ray: 1.9938824658616179, blend: .11214341939632295 },
] as const

describe('editable frame and lattice recipes', () => {
  it.each(references)('keeps source order, materials and the final smooth join for $id', reference => {
    const scene = createBuilderRecipe(reference.id)
    expect(scene.kind).toBe('builder')
    expect(scene).not.toHaveProperty('templateId')
    expect(scene.parameters.scale).toBe(1)
    expect(scene.objects.map(object => object.operation.type)).toEqual(reference.types)
    for (const object of scene.objects) {
      expect(object.material.color).toBe(reference.color)
      expect(object.material.metalness).toBeCloseTo(.6 * reference.metal, 12)
      expect(object.material.shininess).toBe(reference.shine)
      expect(object.modifiers).toEqual([])
    }
    const [motion, view, body] = scene.composition!.groups
    expect(motion.children).toEqual([view.id])
    expect(view.children).toEqual([body.id, scene.objects.at(-1)!.id])
    expect(body.children).toEqual(scene.objects.slice(0, -1).map(object => object.id))
    expect(view.transform.rotationOrder).toBe('zyx')
    expect(body.operation.type).toBe('union')
    expect(view.operation).toEqual({ type: 'smooth-union', blend: reference.blend / 2 })
    const pointerDown = motion.drivers!.map(driver => readDriverPreset(driver.expression)).find(value => value?.source === 'pointer-down')!
    expect(pointerDown.amount).toBe(1)
    const rayY = view.drivers!.map(driver => readDriverPreset(driver.expression)).find(value => value?.source === 'view-ray.x')!
    expect(rayY.amount).toBe(-reference.ray)
    const blend = readDriverPreset(view.drivers!.find(driver => driver.target === 'blend')!.expression)!
    expect(blend.preset).toBe('pulse')
    expect(blend.speed).toBe(.06)
    expect(blend.amount).toBe(reference.blend)
    expect(blend.phase).toBe(-Math.PI / 2)
    expect(parseSceneDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
  })

  it.each(references)('compiles $id in the shipped engine and unchanged workload limits', ({ id, types }) => {
    const scene = createBuilderRecipe(id)
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const compiled = compile(scene)
      expect(compiled.workload.expandedPrimitives).toBe(types.length)
      expect(compiled.workload.liveUniforms).toBeLessThanOrEqual(64)
      expect(compiled.workload.driverOperations).toBeLessThanOrEqual(192)
      expect(compiled.workload.modifierOperations).toBeLessThanOrEqual(80)
      expect(compiled.workload.groups).toBe(3)
      expect(compiled.workload.groupDepth).toBe(3)
      expect(compiled.shader).toContain('setMaxIterations(96);setStepSize(0.7);')
      expect(compiled.shader).not.toContain('embedded-scene-')
      expect(() => normalizeCompiledShader(compileShader(compiled.shader, { maxRaymarchIterations: 96 }), { maxRaymarchIterations: 96 })).not.toThrow()
    }
  })

  it.each(references)('plays and saves $id after editing every settings section and adding an influence', ({ id }) => {
    const settings = fullyEditedSettings(id)
    const scene = createBuilderRecipe(id, settings)
    scene.objects[0].drivers = [defaultDriverPreset(scene.objects[0], 'spin').driver]
    expect(scene.settings).toEqual(settings)
    expect(objectFieldCount(scene)).toBeLessThanOrEqual(SCENE_LIMITS.totalKeys)
    expect(validateSceneForPlayback(scene)).toEqual(scene)
    expect(validateSceneForStorage(scene)).toEqual(scene)
    expect(validateSceneForPlayback(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    expect(compileBuilderPreviewDocument(scene).workload.liveUniforms).toBeLessThanOrEqual(64)
  })

  it('keeps the fixed-reference Mint Halo preview inside actual player and storage validation', () => {
    const scene = createBuilderRecipe('embedded-scene-8', fullyEditedSettings('embedded-scene-8'))
    scene.parameters = { scale: 1, speed: 0 }
    scene.settings.camera = { ...scene.settings.camera, fov: 75, autoRotate: false, orbitSpeed: 0, tilt: 0, orientationMode: 0 }
    scene.settings.controls = { position0: { x: 0, y: 0, z: 5.5 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 }
    scene.settings.motion = { minimizing_factor: .8, power_factor: 8, pointerDownMultiplier: 0, base_speed: 0, easing_speed: 1 }
    scene.settings.state = { size: .6, time: 0, pointerDown: 0, currPointerDown: 0, currAudio: 0, volume_multiplier: 0 }
    scene.settings.audioResponse = 'legacy'
    expect(validateSceneForPlayback(scene)).toEqual(scene)
    expect(validateSceneForStorage(scene)).toEqual(scene)
  })

  it('preserves original grid roundness multiplication and thick frame semantics', () => {
    const steel = createBuilderRecipe('embedded-scene-1')
    expect(steel.objects[0].operation).toMatchObject({ type: 'lattice', iterations: 3, spacing: .6 * .7174867540818692 })
    if (steel.objects[0].operation.type !== 'lattice') throw new Error('Expected lattice')
    expect(steel.objects[0].operation.thickness).toBeCloseTo(.01 * (.6 * .7174867540818692) ** 2, 12)
    expect(steel.objects[1].operation).toEqual({ type: 'box-frame', width: .6 * .6287507765216367,
      height: .6 * .6287507765216367, depth: .6 * .6287507765216367, thickness: .6 * .6287507765216367 })
    expect(steel.objects[3].operation).toMatchObject({ type: 'box-frame', width: .42, thickness: .03 })
    const ember = createBuilderRecipe('embedded-scene-9')
    const rods = ember.objects[1].operation
    expect(rods.type).toBe('lattice')
    if (rods.type !== 'lattice') throw new Error('Expected lattice')
    expect(rods.thickness).toBeCloseTo(.01 * (.6 * .508466039994321) ** 2, 12)
    expect(rods.thickness).toBeLessThan(.001)
    const support = createBuilderRecipe('embedded-scene-3').objects[2].operation
    expect(support).toMatchObject({ type: 'lattice', iterations: 2, spacing: 2.4 })
    if (support.type !== 'lattice') throw new Error('Expected lattice')
    expect(support.thickness).toBeCloseTo(.00432, 12)
  })

  it('returns independent documents and retains authored scene settings', () => {
    const first = createBuilderRecipe('embedded-scene-8')
    first.objects[0].name = 'Edited ring'
    first.settings.skybox = 3
    const next = createBuilderRecipe('embedded-scene-8', first.settings)
    expect(next.objects[0].name).toBe('Mint ring')
    expect(next.settings.skybox).toBe(3)
    next.settings.skybox = 5
    expect(first.settings.skybox).toBe(3)
    expect(BUILDER_RECIPES.map(recipe => recipe.templateId)).toContain('embedded-scene-5')
    expect(createBuilderRecipe('embedded-scene-5').objects).toHaveLength(3)
    expect(() => createBuilderRecipe('embedded-scene-2')).toThrow('does not have an editable Builder version')
  })

  it('records the source quality differences without altering the Builder profile', () => {
    const profiles = [[1, 101, .7260629659452175], [3, 71, .4414923770441956], [6, 198, .8838993805155669],
      [7, 193, .7999169963821687], [8, 186, .8615043142034936], [9, 56, .7549446257595138], [10, 151, .26597607104610804]]
    for (const [number, sourceIterations, sourceStepSize] of profiles) {
      expect(builderRecipeReference(`embedded-scene-${number}` as TemplateId)).toMatchObject({ size: .6, sourceIterations, sourceStepSize })
    }
    expect(builderRecipeReference('embedded-scene-2')).toBeNull()
  })
})
