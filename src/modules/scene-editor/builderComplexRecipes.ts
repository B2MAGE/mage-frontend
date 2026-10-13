import type { BuilderDriver, BuilderDriverExpression, BuilderDriverTarget, BuilderGroup, BuilderObject, BuilderOperation, BuilderSceneDocument } from '@modules/player'
import { createBuilderObject, createBuilderScene } from './builderEditor'
import { identityBuilderFrame } from './builderGroups'
import { createTemplateScene } from './templateEditor'

type Expression = BuilderDriverExpression
type Axis = 'x' | 'y' | 'z'
type RecipeId = 'embedded-scene-0' | 'embedded-scene-13'
const referenceSize = .6
const constant = (value: number): Expression => ({ type: 'constant', value })
const input = (source: Extract<Expression, { type: 'input' }>['source']): Expression => ({ type: 'input', source })
const add = (left: Expression, right: Expression): Expression => ({ type: 'add', left, right })
const multiply = (left: Expression, right: Expression): Expression => ({ type: 'multiply', left, right })
const scaled = (value: Expression, amount: number) => multiply(value, constant(amount))
const trig = (type: 'sin' | 'cos', value: Expression): Expression => ({ type, input: value })
const normalized = (type: 'sin' | 'cos', value: Expression) => add(scaled(trig(type, value), .5), constant(.5))
const clamp = (value: Expression, min: number, max: number): Expression => ({ type: 'clamp', input: value, min, max })
const component = (source: 'scene-pointer' | 'view-ray', axis: Axis): Expression => ({ type: 'component', input: input(source), axis })
const size = () => input('scene-size')
const pointer = () => input('scene-pointer-down')
const driver = (target: BuilderDriverTarget, expression: Expression, mode: BuilderDriver['mode'] = 'add'): BuilderDriver => ({ target, expression, mode })
const ratio = (target: BuilderDriverTarget, expression: Expression, baseline: number) => driver(target, scaled(expression, 1 / baseline), 'multiply')
const object = (id: string, name: string, operation: BuilderOperation): BuilderObject => ({ ...createBuilderObject(operation.type), id, name, operation })
const group = (id: string, name: string, children: string[], extra: Partial<BuilderGroup> = {}): BuilderGroup => ({
  id, name, children, transform: identityBuilderFrame(), operation: { type: 'union' }, ...extra,
})

export const COMPLEX_RECIPE_REFERENCES = {
  // The original omits a quality override; its engine default of 300 iterations
  // is capped to 200 by the same current playback profile used by this document.
  'embedded-scene-0': { sourceIterations: 200, sourceStepSize: .85 },
  'embedded-scene-13': { sourceIterations: 48, sourceStepSize: .7838 },
} as const

/** Only ordinary objects, groups, and expressions leave this constructor. */
export function createComplexBuilderRecipe(templateId: RecipeId,
  settings?: BuilderSceneDocument['settings'], parameters?: BuilderSceneDocument['parameters']): BuilderSceneDocument {
  const scene = createBuilderScene(templateId), template = createTemplateScene(templateId)
  const content = templateId === 'embedded-scene-0' ? prismCore() : roseCircuit()
  const reference = COMPLEX_RECIPE_REFERENCES[templateId]
  return {
    ...scene, ...content, parameters: structuredClone(parameters ?? template.parameters), settings: structuredClone(settings ?? template.settings),
    rendering: { maxIterations: reference.sourceIterations, stepSize: reference.sourceStepSize },
  }
}

function prismCore(): Pick<BuilderSceneDocument, 'objects' | 'composition'> {
  const clock = () => scaled(input('time'), .3)
  const sceneSize = () => scaled(size(), 1.3)
  const baseline = referenceSize * 1.3
  const objects = [
    object('recipe-0-frame', 'Outer prism frame', { type: 'box-frame', width: baseline, height: baseline, depth: baseline, thickness: baseline * .1 }),
    object('recipe-0-sphere', 'Reflective core sphere', { type: 'sphere', radius: baseline / 2 }),
    object('recipe-0-solid-frame', 'Filled inner frame', { type: 'box-frame', width: baseline, height: baseline, depth: baseline, thickness: baseline }),
  ]
  objects.forEach((node, index) => {
    node.material = { color: { x: .2, y: .25, z: .2 }, metalness: baseline * .5, shininess: index ? baseline * .8 : .3 }
    node.drivers = [
      ...(['r', 'g', 'b'] as const).map((channel, channelIndex) => driver(`material.color.${channel}`, component('view-ray', (['x', 'y', 'z'] as const)[channelIndex]))),
      ratio('material.metalness', scaled(sceneSize(), .5), node.material.metalness),
      ...(index ? [ratio('material.shininess', scaled(sceneSize(), .8), node.material.shininess)] : []),
    ]
    if (node.operation.type === 'sphere') {
      node.drivers.push(ratio('operation.radius', add(scaled(sceneSize(), .5), scaled(pointer(), -.3)), node.operation.radius))
    } else if (node.operation.type === 'box-frame') {
      const width = index ? add(sceneSize(), scaled(pointer(), -.075)) : sceneSize()
      node.drivers.push(...(['width', 'height', 'depth'] as const).map(axis => ratio(`operation.${axis}`, width, baseline)),
        ratio('operation.thickness', scaled(sceneSize(), index ? 1 : .1), node.operation.thickness))
    }
  })
  const sharedMotion = group('recipe-0-motion', 'Pointer motion', ['recipe-0-outer-join'], { drivers: [
    driver('rotation.x', multiply(scaled(component('scene-pointer', 'y'), Math.PI), add(constant(1), normalized('sin', clock())))),
    driver('rotation.y', multiply(scaled(component('scene-pointer', 'x'), Math.PI), add(constant(1), normalized('sin', clock())))),
  ] })
  const outer = group('recipe-0-outer-join', 'View shaping and outer join', ['recipe-0-inner-join', objects[2].id], {
    // Reverse of source Y, X, Z; the frame compiler also compensates Y's sign.
    transform: { ...identityBuilderFrame(), rotationOrder: 'zxy' }, operation: { type: 'smooth-union', blend: .15 },
    drivers: [
      driver('rotation.y', scaled(trig('sin', add(multiply(scaled(component('view-ray', 'y'), 8), normalized('cos', trig('sin', clock()))), sceneSize())), -1)),
      driver('rotation.x', trig('cos', add(multiply(scaled(component('view-ray', 'x'), 16), normalized('sin', clock())), sceneSize()))),
      driver('rotation.z', normalized('cos', add(multiply(scaled(component('view-ray', 'z'), 4), trig('cos', clock())), sceneSize()))),
      driver('blend', scaled(trig('cos', multiply(clock(), sceneSize())), .05)),
    ],
  })
  const inner = group('recipe-0-inner-join', 'Frame and sphere join', [objects[0].id, objects[1].id], {
    operation: { type: 'smooth-union', blend: .15 }, drivers: [driver('blend', scaled(trig('sin', multiply(clock(), sceneSize())), .05))],
  })
  return { objects, composition: { version: 1, roots: [sharedMotion.id], groups: [sharedMotion, outer, inner] } }
}

const roseShapes = [
  { name: 'First rose ring', rotation: [1.1899, 1.364, -.2239], frequency: 1.8883, rotationPhase: 5.4271, rotationAmount: .0054,
    radiusMinimum: .1314, radiusScale: .6537, radiusPointer: .1257, radiusAmount: .0108, phase: 2.4569, thicknessMinimum: .0807, thicknessScale: .1909, colorPhase: 0 },
  { name: 'Second rose ring', rotation: [.8582, 1.4936, 1.5492], frequency: 1.0024, rotationPhase: 9.101, rotationAmount: .0042,
    radiusMinimum: .1324, radiusScale: .6252, radiusPointer: .1172, radiusAmount: .0083, phase: 6.1307, thicknessMinimum: .041, thicknessScale: .1639, colorPhase: .0589 },
  { name: 'Rose center cylinder', rotation: [-1.0307, .8766, -.0164], frequency: .5909, rotationPhase: 5.4207, rotationAmount: .0041,
    radiusMinimum: .0904, radiusScale: .1671, radiusPointer: .1318, radiusAmount: .0081, phase: 2.4505, thicknessMinimum: .0904, thicknessScale: 1.7875, colorPhase: .1178 },
] as const

function roseCircuit(): Pick<BuilderSceneDocument, 'objects' | 'composition'> {
  // Algebraically folding t's affine constants makes each editable expression
  // shallower without changing its phase, frequency, or native scene inputs.
  const phase = (frequency: number, offset = 0) => add(scaled(input('time'), .226 * frequency), constant(1.5716 * frequency + offset))
  const wave = (kind: 'sin' | 'cos' | 'nsin', frequency: number, offset = 0) => kind === 'nsin'
    ? normalized('sin', phase(frequency, offset)) : trig(kind, phase(frequency, offset))
  const baseSize = () => clamp(add(add(constant(.3225), scaled(size(), 1.2464)), scaled(pointer(), .0867)), .2708, 1000)
  const radius = (index: number) => {
    const shape = roseShapes[index]
    return clamp(add(add(scaled(baseSize(), shape.radiusScale), scaled(pointer(), shape.radiusPointer)),
      scaled(wave('sin', shape.frequency, shape.phase), shape.radiusAmount)), shape.radiusMinimum, 1000)
  }
  const radiusAtReference = (index: number) => {
    const shape = roseShapes[index]
    return Math.max(shape.radiusMinimum, (.3225 + referenceSize * 1.2464) * shape.radiusScale
      + Math.sin(1.5716 * shape.frequency + shape.phase) * shape.radiusAmount)
  }
  const rotations = (index: number) => (['x', 'y', 'z'] as const).map((axis, axisIndex) => {
    const shape = roseShapes[index]
    return { axis, baseline: shape.rotation[axisIndex], expression: scaled(wave(axis === 'x' ? 'sin' : axis === 'y' ? 'cos' : 'nsin', shape.frequency, shape.rotationPhase), shape.rotationAmount) }
  })
  const material = { color: { x: .745, y: .2488, z: .6122 }, metalness: .6355, shininess: .4079 + referenceSize * .05 }
  const objects = roseShapes.map((shape, index) => {
    const baselineRadius = radiusAtReference(index)
    const operation: BuilderOperation = index < 2
      ? { type: 'torus', radius: baselineRadius, tube: Math.max(shape.thicknessMinimum, baselineRadius * shape.thicknessScale) }
      : { type: 'cylinder', radius: Math.max(.1318, baselineRadius * .2033), height: Math.max(.0904, baselineRadius * 1.7875) }
    const node = object(`recipe-13-object-${index + 1}`, shape.name, operation)
    node.material = structuredClone(material)
    node.transform.rotation = { x: shape.rotation[0], y: shape.rotation[1], z: shape.rotation[2] }
    node.drivers = [
      ...rotations(index).map(rotation => driver(`rotation.${rotation.axis}`, rotation.expression)),
      ratio('operation.radius', index < 2 ? radius(index) : clamp(scaled(radius(index), .2033), .1318, 1000), operation.radius),
      ratio(operation.type === 'torus' ? 'operation.tube' : 'operation.height', clamp(scaled(radius(index), shape.thicknessScale), shape.thicknessMinimum, 1000),
        operation.type === 'torus' ? operation.tube : operation.height),
      ...(['r', 'g', 'b'] as const).map((channel, channelIndex) => {
        const axis = (['x', 'y', 'z'] as const)[channelIndex]
        const baseline = material.color[axis]
        const frequencies = [.8768, .5164, 1.553], amounts = [.305, .2285, .273]
        const value = clamp(add(add(constant(baseline), scaled(component('view-ray', axis), .3719)),
          scaled(wave(channelIndex === 0 ? 'sin' : channelIndex === 1 ? 'cos' : 'nsin', frequencies[channelIndex], shape.colorPhase), amounts[channelIndex])), 0, 1)
        return ratio(`material.color.${channel}`, value, baseline)
      }),
      ratio('material.metalness', clamp(add(constant(.6355), scaled(pointer(), .12)), 0, 1), material.metalness),
      ratio('material.shininess', clamp(add(constant(.4079), scaled(size(), .05)), 0, 1), material.shininess),
    ]
    return node
  })
  const join = (phaseOffset: number) => driver('blend', scaled(trig('sin', phase(.6211, phaseOffset)), .0117))
  const motion = group('recipe-13-motion', 'Shared motion and final join', ['recipe-13-cylinder-sampling', objects[2].id], {
    transform: { ...identityBuilderFrame(), rotationOrder: 'zxy' }, operation: { type: 'smooth-union', blend: .1215 }, drivers: [
      driver('rotation.y', scaled(add(add(scaled(component('view-ray', 'x'), .8003), scaled(component('scene-pointer', 'x'), .83)), scaled(wave('sin', 1.0544), .0592)), -1)),
      driver('rotation.x', add(add(scaled(component('view-ray', 'y'), 1.3923), scaled(component('scene-pointer', 'y'), 2.2418)), scaled(wave('cos', 1.5395), .0513))),
      driver('rotation.z', add(scaled(component('view-ray', 'z'), .9036), scaled(wave('sin', .3942, 2.9702), .1384))),
      join(1.0179),
    ],
  })
  const samplingPair = (index: 1 | 2, child: string, frequency: number, noiseAmount: number, waveFrequency: number, wavePhase: number, waveAmount: number) => {
    const suffix = index === 1 ? 'ring' : 'cylinder'
    const shape = roseShapes[index]
    const sample = group(`recipe-13-${suffix}-sampling`, `Sample ${index === 1 ? 'second ring' : 'cylinder'} coordinates`, [`recipe-13-${suffix}-restore`], {
      transform: { ...identityBuilderFrame(), rotationOrder: 'zyx', rotation: { x: shape.rotation[0], y: -shape.rotation[1], z: shape.rotation[2] } },
      drivers: rotations(index).map(rotation => driver(`rotation.${rotation.axis}`, scaled(rotation.expression, rotation.axis === 'y' ? -1 : 1))),
    })
    const restore = group(`recipe-13-${suffix}-restore`, index === 1 ? 'Noise on first ring' : 'Join rings and add noise', index === 1 ? [child] : [child, objects[1].id], {
      transform: { ...identityBuilderFrame(), rotationOrder: 'xyz', rotation: { x: -shape.rotation[0], y: shape.rotation[1], z: -shape.rotation[2] } },
      ...(index === 2 ? { operation: { type: 'smooth-union' as const, blend: .1215 } } : {}),
      modifiers: [{ type: 'expand', amount: noiseAmount }],
      drivers: [
        ...rotations(index).map(rotation => driver(`rotation.${rotation.axis}`, scaled(rotation.expression, rotation.axis === 'y' ? 1 : -1))),
        ...(index === 2 ? [join(.5089)] : []),
        driver('modifier.expand.amount', { type: 'noise', input: scaled(input('group-position'), frequency) }, 'multiply'),
        driver('modifier.expand.amount', scaled(wave('nsin', waveFrequency, wavePhase), waveAmount)),
      ],
    })
    return [sample, restore]
  }
  // reset() only resets coordinates. Later source expands therefore deform the
  // previous accumulated shape using the NEXT object's local coordinates.
  // Ordinary inverse frames let us inspect/recreate that scope in the UI. The
  // first expand only touches the empty distance sentinel and has no surface.
  const ringScope = samplingPair(1, objects[0].id, 2.6572, .0002, 1.6689, 6.1307, .0059)
  const cylinderScope = samplingPair(2, ringScope[0].id, 1.0838, .01, 2.1073, 2.4505, .0003)
  return { objects, composition: { version: 1, roots: [motion.id], groups: [motion, ...cylinderScope, ...ringScope] } }
}
