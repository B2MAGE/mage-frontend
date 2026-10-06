import policy from '../../../../contracts/scenes/builder-rendering.v1.json'
import { templateOptionalEffectCount } from './templateSettings'
import type { BuilderArrangement, BuilderBinding, BuilderObject, BuilderSceneDocument, BuilderVector } from './sceneContract'

export const BUILDER_COMPILER_VERSION = 1 as const
export const BUILDER_RENDERING_POLICY = Object.freeze({
  ...policy,
  limits: Object.freeze({ ...policy.limits }),
  operationCosts: Object.freeze({ ...policy.operationCosts }),
})

export type BuilderWorkload = Readonly<{
  expandedPrimitives: number
  compositionOperations: number
  transformOperations: number
  materialOperations: number
  modifierOperations: number
  arrangementOperations: number
  animationOperations: number
  liveUniforms: number
  optionalEffects: number
  generatedSourceBytes: number
}>

export type BuilderUniform = Readonly<{
  objectId: string
  objectIndex: number
  target: BuilderBinding['target']
  name: string
  initialValue: number
  minimum: number
  maximum: number
}>

export type BuilderCompilation = Readonly<{
  compilerVersion: typeof BUILDER_COMPILER_VERSION
  shader: string
  uniforms: readonly BuilderUniform[]
  workload: BuilderWorkload
}>

export class BuilderCompilationError extends Error {
  readonly path: string

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`)
    this.name = 'BuilderCompilationError'
    this.path = path
  }
}

type UniformRange = Readonly<{ minimum: number; maximum: number }>
const TARGET_RANGES: Readonly<Record<BuilderBinding['target'], UniformRange>> = Object.freeze({
  'position.x': { minimum: -100, maximum: 100 },
  'position.y': { minimum: -100, maximum: 100 },
  'position.z': { minimum: -100, maximum: 100 },
  'rotation.x': { minimum: -2 * Math.PI, maximum: 2 * Math.PI },
  'rotation.y': { minimum: -2 * Math.PI, maximum: 2 * Math.PI },
  'rotation.z': { minimum: -2 * Math.PI, maximum: 2 * Math.PI },
  'scale.x': { minimum: 0.01, maximum: 20 },
  'scale.y': { minimum: 0.01, maximum: 20 },
  'scale.z': { minimum: 0.01, maximum: 20 },
  'material.metalness': { minimum: 0, maximum: 1 },
  'material.shininess': { minimum: 0, maximum: 1 },
})
const TARGET_TOKENS: Readonly<Record<BuilderBinding['target'], string>> = Object.freeze({
  'position.x': 'position_x', 'position.y': 'position_y', 'position.z': 'position_z',
  'rotation.x': 'rotation_x', 'rotation.y': 'rotation_y', 'rotation.z': 'rotation_z',
  'scale.x': 'scale_x', 'scale.y': 'scale_y', 'scale.z': 'scale_z',
  'material.metalness': 'material_metalness', 'material.shininess': 'material_shininess',
})
const encoder = new TextEncoder()

function fail(path: string, detail: string): never {
  throw new BuilderCompilationError(path, detail)
}

function literal(value: number): string {
  if (!Number.isFinite(value)) throw new BuilderCompilationError('sceneData', 'Builder compiler received a non-finite number.')
  return Object.is(value, -0) ? '0' : String(value)
}

function propertyValue(object: BuilderObject, target: BuilderBinding['target']): number {
  const [branch, field] = target.split('.') as ['position' | 'rotation' | 'scale' | 'material', string]
  if (branch === 'material') return object.material[field as 'metalness' | 'shininess']
  return object.transform[branch][field as 'x' | 'y' | 'z']
}

/** Uniform names depend only on the validated object position and target enum. */
export function builderUniformName(objectIndex: number, target: BuilderBinding['target']): string {
  if (!Number.isSafeInteger(objectIndex) || objectIndex < 0 || objectIndex >= policy.limits.expandedPrimitives) {
    fail('sceneData.objects', 'Object index exceeds the Builder rendering budget.')
  }
  return `builder_o${objectIndex}_${TARGET_TOKENS[target]}`
}

function colorChannels(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16)
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function primitiveDistanceSource(object: BuilderObject, suffix: string): string {
  const operation = object.operation
  switch (operation.type) {
    case 'sphere': return `let builder_distance_${suffix}=extractSDF(sphere)(${literal(operation.radius)});`
    case 'box': {
      // Shader Park's generated compiler does not expose its `box` helper inside
      // a dedicated browser Worker. Emit the equivalent allowlisted SDF math so
      // Builder boxes compile in the same isolated path used in production.
      const space = `builder_box_space_${suffix}`
      const delta = `builder_box_delta_${suffix}`
      const outside = `builder_box_outside_${suffix}`
      return [
        `let ${space}=getSpace();`,
        `let ${delta}=abs(${space})-vec3(${literal(operation.width)},${literal(operation.height)},${literal(operation.depth)});`,
        `let ${outside}=vec3(max(${delta}.x,0),max(${delta}.y,0),max(${delta}.z,0));`,
        `let builder_distance_${suffix}=min(max(${delta}.x,max(${delta}.y,${delta}.z)),0)+length(${outside});`,
      ].join('')
    }
    case 'torus': return `let builder_distance_${suffix}=extractSDF(torus)(${literal(operation.radius)},${literal(operation.tube)});`
    case 'cylinder': return `let builder_distance_${suffix}=extractSDF(cylinder)(${literal(operation.radius)},${literal(operation.height)});`
    default: return fail('sceneData.objects.operation.type', 'Unsupported Builder operation.')
  }
}

function addVector(left: BuilderVector, right: BuilderVector): BuilderVector {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }
}

function arrangementOffsets(arrangement: BuilderArrangement): BuilderVector[] {
  if (arrangement.type === 'linear') {
    return Array.from({ length: arrangement.count }, (_, index) => {
      const value = (index - (arrangement.count - 1) / 2) * arrangement.spacing
      return { x: arrangement.axis === 'x' ? value : 0, y: arrangement.axis === 'y' ? value : 0, z: arrangement.axis === 'z' ? value : 0 }
    })
  }
  return Array.from({ length: arrangement.count }, (_, index) => {
    const angle = index * Math.PI * 2 / arrangement.count
    const first = Math.cos(angle) * arrangement.radius
    const second = Math.sin(angle) * arrangement.radius
    if (arrangement.axis === 'x') return { x: 0, y: first, z: second }
    if (arrangement.axis === 'y') return { x: first, y: 0, z: second }
    return { x: first, y: second, z: 0 }
  })
}

/** Arrangement stages are ordered. Each later stage repeats the complete result of the previous stage. */
function expandedOffsets(object: BuilderObject): BuilderVector[] {
  return object.arrangements.reduce<BuilderVector[]>((offsets, arrangement) => {
    const additions = arrangementOffsets(arrangement)
    return offsets.flatMap(offset => additions.map(addition => addVector(offset, addition)))
  }, [{ x: 0, y: 0, z: 0 }])
}

function modifierExpression(object: BuilderObject, distance: string): string {
  return object.modifiers.reduce((expression, modifier) => modifier.type === 'expand'
    ? `(${expression}-${literal(modifier.amount)})`
    : modifier.type === 'shell' ? `(abs(${expression})-${literal(modifier.thickness)})` : expression, distance)
}

function coordinateModifierSource(object: BuilderObject, suffix: string): string {
  return object.modifiers.flatMap((modifier, modifierIndex) => {
    if (modifier.type !== 'twist') return []
    const space = `builder_twist_space_${suffix}_${modifierIndex}`
    const angle = `builder_twist_angle_${suffix}_${modifierIndex}`
    const amount = literal(modifier.amount)
    if (modifier.axis === 'x') return [
      `let ${space}=getSpace();let ${angle}=${space}.x*${amount};`,
      `setSpace(vec3(${space}.x,${space}.y*cos(${angle})-${space}.z*sin(${angle}),${space}.y*sin(${angle})+${space}.z*cos(${angle})));`,
    ]
    if (modifier.axis === 'y') return [
      `let ${space}=getSpace();let ${angle}=${space}.y*${amount};`,
      `setSpace(vec3(${space}.x*cos(${angle})-${space}.z*sin(${angle}),${space}.y,${space}.x*sin(${angle})+${space}.z*cos(${angle})));`,
    ]
    return [
      `let ${space}=getSpace();let ${angle}=${space}.z*${amount};`,
      `setSpace(vec3(${space}.x*cos(${angle})-${space}.y*sin(${angle}),${space}.x*sin(${angle})+${space}.y*cos(${angle}),${space}.z));`,
    ]
  }).join('')
}

function initialWorkload(document: BuilderSceneDocument): Omit<BuilderWorkload, 'generatedSourceBytes'> {
  const expandedCounts = document.objects.map(object => expandedOffsets(object).length)
  const expandedPrimitives = expandedCounts.reduce((sum, count) => sum + count, 0)
  return {
    expandedPrimitives,
    compositionOperations: Math.max(0, expandedPrimitives - 1) * policy.operationCosts.compositionPerAdditionalObject,
    transformOperations: expandedPrimitives * policy.operationCosts.transformPerObject,
    materialOperations: expandedPrimitives * policy.operationCosts.materialPerObject,
    modifierOperations: document.objects.reduce((sum, object, index) => sum + expandedCounts[index] * object.modifiers.reduce((cost, modifier) =>
      cost + policy.operationCosts[modifier.type === 'expand' ? 'expandModifier'
        : modifier.type === 'shell' ? 'shellModifier' : 'twistModifier'], 0), 0),
    arrangementOperations: document.objects.reduce((sum, _object, index) =>
      sum + Math.max(0, expandedCounts[index] - 1) * policy.operationCosts.arrangementPerAdditionalCopy, 0),
    animationOperations: document.objects.reduce((sum, object, index) =>
      sum + (object.motion.type === 'spin' ? expandedCounts[index] * policy.operationCosts.spinPerPrimitive : 0), 0),
    liveUniforms: document.objects.reduce((sum, object) => sum + object.bindings.length * policy.operationCosts.liveUniformPerBinding, 0),
    optionalEffects: templateOptionalEffectCount(document.settings),
  }
}

function assertBudget(workload: BuilderWorkload): void {
  for (const [field, maximum] of Object.entries(policy.limits)) {
    const value = workload[field as keyof BuilderWorkload]
    if (value > maximum) fail('sceneData.objects', `${field} requires ${value}; maximum is ${maximum}.`)
  }
}

/**
 * Compile normalized Builder data into allowlisted Shader Park operations.
 * IDs, names and binding sources never enter generated source. Only validated
 * numeric values and fixed operation tokens are emitted.
 */
export function compileBuilderDocument(document: BuilderSceneDocument): BuilderCompilation {
  const baseWorkload = initialWorkload(document)
  const uniforms: BuilderUniform[] = []
  const declarations: string[] = []
  const objects: string[] = []

  document.objects.forEach((object, objectIndex) => {
    const values = new Map<BuilderBinding['target'], string>()
    object.bindings.forEach(binding => {
      const range = TARGET_RANGES[binding.target]
      if (!range) fail(`sceneData.objects[${objectIndex}].bindings`, 'Unsupported live property target.')
      const name = builderUniformName(objectIndex, binding.target)
      const initialValue = propertyValue(object, binding.target)
      declarations.push(`let ${name}=input(${literal(initialValue)},${literal(range.minimum)},${literal(range.maximum)});`)
      uniforms.push({ objectId: object.id, objectIndex, target: binding.target, name, initialValue, ...range })
      values.set(binding.target, name)
    })
    const read = (target: BuilderBinding['target']) => values.get(target) ?? literal(propertyValue(object, target))
    const [red, green, blue] = colorChannels(object.material.color)
    const scaleX = read('scale.x'), scaleY = read('scale.y'), scaleZ = read('scale.z')
    expandedOffsets(object).forEach((offset, copyIndex) => {
      const suffix = `${objectIndex}_${copyIndex}`
      const spin = object.motion.type === 'spin' ? object.motion : null
      const rotation = (axis: 'x' | 'y' | 'z') => spin?.axis === axis
        ? `(${read(`rotation.${axis}`)}+time*${literal(spin.speed)})`
        : read(`rotation.${axis}`)
      objects.push([
        `let builder_object_${suffix}=shape(()=>{`,
        `displace((${read('position.x')}+${literal(offset.x)}),(${read('position.y')}+${literal(offset.y)}),(${read('position.z')}+${literal(offset.z)}));`,
        `rotateX(${rotation('x')});rotateY(${rotation('y')});rotateZ(${rotation('z')});`,
        `let builder_space_${suffix}=getSpace();`,
        `setSpace(vec3(builder_space_${suffix}.x/${scaleX},builder_space_${suffix}.y/${scaleY},builder_space_${suffix}.z/${scaleZ}));`,
        coordinateModifierSource(object, suffix),
        `color(${literal(red)},${literal(green)},${literal(blue)});`,
        `metal(${read('material.metalness')});shine(${read('material.shininess')});`,
        primitiveDistanceSource(object, suffix),
        `setSDF(${modifierExpression(object, `builder_distance_${suffix}`)}*min(${scaleX},min(${scaleY},${scaleZ})));`,
        `});builder_object_${suffix}();`,
      ].join(''))
    })
  })

  const shader = [`setMaxIterations(96);setStepSize(0.7);`, ...declarations, ...objects].join('\n')
  const workload: BuilderWorkload = { ...baseWorkload, generatedSourceBytes: encoder.encode(shader).byteLength }
  assertBudget(workload)
  return Object.freeze({ compilerVersion: BUILDER_COMPILER_VERSION, shader,
    uniforms: Object.freeze(uniforms.map(uniform => Object.freeze(uniform))), workload: Object.freeze(workload) })
}
