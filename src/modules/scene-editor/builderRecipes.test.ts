import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { parseSceneDocument, type BuilderDriverExpression, type BuilderDriver, type BuilderOperation, type TemplateId } from '../player/templates/sceneContract'
import { SCENE_LIMITS, validateSceneForPlayback, validateSceneForStorage } from '../player/policy/sceneValidation'
import { defaultDriverPreset } from './builderDrivers'
import { BUILDER_RECIPES, builderRecipeReference, createBuilderRecipe } from './builderRecipes'
import { createTemplateScene, getTemplateEditorModel } from './templateEditor'
import { readTemplateShaderSource } from '../player/templates/templateSource'

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
  { id: 'embedded-scene-5', types: ['cylinder', 'sphere', 'sphere'], color: '#3d4437', metal: .6304962928840792, shine: .6210181878056416, ray: 1.9599006869721014, blend: .11435451161014794 },
  { id: 'embedded-scene-6', types: ['sphere', 'cylinder', 'lattice', 'lattice'], color: '#f31b00', metal: .7125574975041655, shine: .5774589834819871, ray: 2.1969051528600634, blend: .22861033952631743 },
  { id: 'embedded-scene-7', types: ['lattice', 'lattice', 'sphere', 'sphere'], color: '#1d0277', metal: .5711799571404537, shine: .5590513531439385, ray: 2.0857194147559914, blend: .1017060511129565 },
  { id: 'embedded-scene-8', types: ['torus', 'lattice', 'box-frame', 'lattice', 'sphere', 'lattice'], color: '#67c673', metal: .6607251320316083, shine: .6646852498948923, ray: 1.4049960809220177, blend: .19517422836065718 },
  { id: 'embedded-scene-9', types: ['box-frame', 'lattice', 'sphere'], color: '#ff4d00', metal: .4757753414424941, shine: .4905478148343774, ray: 2.7452866417099218, blend: .10155951925016898 },
  { id: 'embedded-scene-10', types: ['torus', 'box-frame', 'lattice'], color: '#32e93f', metal: .31594207653292694, shine: .3832572948846391, ray: 1.9938824658616179, blend: .11214341939632295 },
] as const

describe('editable template recipes', () => {
  it('covers every offered conversion with source-parity checks', () => {
    // The four noise/material recipes have their own executable-source suite.
    expect([...references.map(reference => reference.id), 'embedded-scene-2', 'embedded-scene-4', 'embedded-scene-11', 'embedded-scene-12'].sort())
      .toEqual(BUILDER_RECIPES.map(recipe => recipe.templateId).sort())
  })

  it.each(references)('keeps source order, materials and the final smooth join for $id', reference => {
    const scene = createBuilderRecipe(reference.id)
    expect(scene.kind).toBe('builder')
    expect(scene).not.toHaveProperty('templateId')
    expect(scene.parameters).toEqual(createTemplateScene(reference.id).parameters)
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
    expect(motion.drivers).toHaveLength(3)
    expect(motion.material).toEqual(scene.objects[0].material)
    expect(view.drivers).toHaveLength(4)
    expect(JSON.stringify(scene)).toContain('scene-size')
    expect(JSON.stringify(scene)).toContain('scene-pointer-down')
    expect(JSON.stringify(scene)).not.toContain('overall-level')
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
      expect(compiled.shader).toContain(`setMaxIterations(${scene.rendering!.maxIterations});setStepSize(${scene.rendering!.stepSize});`)
      expect(compiled.shader).toContain('let size = input();')
      expect(compiled.shader).toContain('let pointerDown = input();')
      expect(compiled.shader).not.toContain('embedded-scene-')
      expect(() => normalizeCompiledShader(compileShader(compiled.shader, { maxRaymarchIterations: 200 }), { maxRaymarchIterations: 200 })).not.toThrow()
    }
  })

  it.each(references)('plays and saves $id after editing every settings section and adding an influence', ({ id }) => {
    const settings = fullyEditedSettings(id)
    const scene = createBuilderRecipe(id, settings)
    scene.objects[0].drivers = [...scene.objects[0].drivers!, defaultDriverPreset(scene.objects[0], 'spin').driver]
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

  it.each(references)('matches executable source dimensions, motion, and material response for $id', ({ id }) => {
    const scene = createBuilderRecipe(id)
    for (const size of [.006, .02, .6, 1.4]) for (const pointerDown of [0, .01, .15, .4]) for (const time of [0, .2, 1.7, 3, 8, 13, 30, 60, 120]) {
      const state: Inputs = { size, pointerDown, time, mouse: { x: -.13, y: .28, z: 0 }, ray: { x: .17, y: -.21, z: -.962 } }
      const original = recordSource(id, state)
      expect(scene.objects).toHaveLength(original.operations.length)
      scene.objects.forEach((object, index) => {
        const actual = { ...object.operation } as Record<string, unknown>
        for (const key of Object.keys(actual)) if (typeof actual[key] === 'number') {
          actual[key] = applyDrivers(object.drivers!, `operation.${key}`, actual[key] as number, state)
        }
        for (const [key, value] of Object.entries(original.operations[index])) {
          if (typeof value === 'number') expect(actual[key], `${id} ${index}.${key} at size=${size}, pointer=${pointerDown}`).toBeCloseTo(value, 12)
          else expect(actual[key]).toEqual(value)
        }
      })
      const [motion, view] = scene.composition!.groups
      expect(applyDrivers(motion.drivers!, 'rotation.y', 0, state)).toBeCloseTo(-original.rotations[0], 12)
      expect(applyDrivers(motion.drivers!, 'rotation.x', 0, state)).toBeCloseTo(original.rotations[1], 12)
      expect(applyDrivers(view.drivers!, 'rotation.x', 0, state)).toBeCloseTo(original.rotations[2], 12)
      expect(applyDrivers(view.drivers!, 'rotation.y', 0, state)).toBeCloseTo(-original.rotations[3], 12)
      expect(applyDrivers(view.drivers!, 'rotation.z', 0, state)).toBeCloseTo(original.rotations[4], 12)
      expect(applyDrivers(motion.drivers!, 'material.metalness', motion.material!.metalness, state)).toBeCloseTo(original.metalness, 12)
      expect(applyDrivers(view.drivers!, 'blend', view.operation.type === 'smooth-union' ? view.operation.blend : 0, state)).toBeCloseTo(original.blend, 12)
    }
  })

  it('keeps ordinary dimensions editable when their native response influence is enabled', () => {
    const scene = createBuilderRecipe('embedded-scene-8')
    const object = scene.objects[0]
    if (object.operation.type !== 'torus') throw new Error('Expected torus')
    const state: Inputs = { size: .02, pointerDown: .01, time: 1, mouse: { x: 0, y: 0, z: 0 }, ray: { x: 0, y: 0, z: -1 } }
    const previous = applyDrivers(object.drivers!, 'operation.radius', object.operation.radius, state)
    object.operation.radius *= 2
    expect(applyDrivers(object.drivers!, 'operation.radius', object.operation.radius, state)).toBeCloseTo(previous * 2, 12)
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
    const customized = createBuilderRecipe('embedded-scene-8', first.settings, { scale: 4.25, speed: .7 })
    expect(customized.parameters).toEqual({ scale: 4.25, speed: .7 })
    expect(BUILDER_RECIPES.map(recipe => recipe.templateId)).toContain('embedded-scene-5')
    expect(createBuilderRecipe('embedded-scene-5').objects).toHaveLength(3)
    expect(() => createBuilderRecipe('embedded-scene-0')).toThrow('does not have an editable Builder version')
  })

  it('preserves the source sampling profile within the existing host ceiling', () => {
    const profiles = [[1, 101, .7260629659452175], [3, 71, .4414923770441956], [5, 56, .7], [6, 198, .8838993805155669],
      [7, 193, .7999169963821687], [8, 186, .8615043142034936], [9, 56, .7549446257595138], [10, 151, .26597607104610804]]
    for (const [number, sourceIterations, sourceStepSize] of profiles) {
      expect(builderRecipeReference(`embedded-scene-${number}` as TemplateId)).toMatchObject({ size: .6, sourceIterations, sourceStepSize })
      expect(createBuilderRecipe(`embedded-scene-${number}` as TemplateId).rendering).toEqual({ maxIterations: sourceIterations, stepSize: sourceStepSize })
    }
    expect(builderRecipeReference('embedded-scene-0')).toBeNull()
  })
})


type Vector = { x: number; y: number; z: number }
type Inputs = { size: number; pointerDown: number; time: number; mouse: Vector; ray: Vector }
function evaluate(expression: BuilderDriverExpression, state: Inputs): number | Vector {
  switch (expression.type) {
    case 'constant': return expression.value
    case 'input': {
      switch (expression.source) {
        case 'time': return state.time
        case 'scene-size': return state.size
        case 'scene-pointer-down': return state.pointerDown
        case 'scene-pointer': return state.mouse
        case 'view-ray': return state.ray
        default: throw new Error(`Unexpected recipe input ${expression.source}`)
      }
    }
    case 'component': return (evaluate(expression.input, state) as Vector)[expression.axis]
    case 'sin': return Math.sin(evaluate(expression.input, state) as number)
    case 'cos': return Math.cos(evaluate(expression.input, state) as number)
    case 'clamp': return Math.max(expression.min, Math.min(expression.max, evaluate(expression.input, state) as number))
    case 'add': return (evaluate(expression.left, state) as number) + (evaluate(expression.right, state) as number)
    case 'multiply': return (evaluate(expression.left, state) as number) * (evaluate(expression.right, state) as number)
    case 'noise': throw new Error('Noise recipes are checked by the deformation reference suite')
  }
}
function applyDrivers(drivers: BuilderDriver[], target: string, baseline: number, state: Inputs) {
  return drivers.filter(driver => driver.target === target).reduce((value, driver) => {
    const influence = evaluate(driver.expression, state) as number
    return driver.mode === 'replace' ? influence : driver.mode === 'add' ? value + influence : value * influence
  }, baseline)
}

/** Execute only our immutable catalog definitions with recording geometry functions. */
function recordSource(templateId: TemplateId, state: Inputs) {
  const operations: BuilderOperation[] = [], rotations: number[] = []
  let inputIndex = 0, metalness = 0, blend = 0
  const bindings = {
    input: () => inputIndex++ ? state.pointerDown : state.size, time: state.time, mouse: state.mouse,
    PI: Math.PI, max: Math.max, nsin: (value: number) => .5 + .5 * Math.sin(value),
    vec3: (value: number) => ({ x: value, y: value, z: value }), getRayDirection: () => state.ray,
    setMaxIterations: () => undefined, setStepSize: () => undefined, color: () => undefined, shine: () => undefined,
    rotateX: (value: number) => rotations.push(value), rotateY: (value: number) => rotations.push(value), rotateZ: (value: number) => rotations.push(value),
    metal: (value: number) => { metalness = value }, blend: (value: number) => { blend = value },
    sphere: (radius: number) => operations.push({ type: 'sphere', radius }),
    cylinder: (radius: number, height: number) => operations.push({ type: 'cylinder', radius, height }),
    torus: (radius: number, tube: number) => operations.push({ type: 'torus', radius, tube }),
    boxFrame: (dimensions: Vector, thickness: number) => operations.push({ type: 'box-frame', width: dimensions.x, height: dimensions.y, depth: dimensions.z, thickness }),
    grid: (iterations: number, spacing: number, roundness: number) => operations.push({ type: 'lattice', iterations, spacing, thickness: spacing * roundness }),
  }
  const source = readTemplateShaderSource({ templateId, templateVersion: 1 })
  new Function(...Object.keys(bindings), source)(...Object.values(bindings))
  return { operations, rotations, metalness, blend }
}
