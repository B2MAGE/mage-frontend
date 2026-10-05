import policy from '../../../../contracts/scenes/builder-rendering.v1.json'
import { templateOptionalEffectCount } from './templateSettings'
import type { BuilderBinding, BuilderObject, BuilderSceneDocument } from './sceneContract'

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

function operationSource(object: BuilderObject): { operation: BuilderObject['operation']['type']; arguments: string } {
  const operation = object.operation
  switch (operation.type) {
    case 'sphere': return { operation: 'sphere', arguments: literal(operation.radius) }
    case 'box': return { operation: 'box', arguments: `${literal(operation.width)},${literal(operation.height)},${literal(operation.depth)}` }
    case 'torus': return { operation: 'torus', arguments: `${literal(operation.radius)},${literal(operation.tube)}` }
    case 'cylinder': return { operation: 'cylinder', arguments: `${literal(operation.radius)},${literal(operation.height)}` }
    default: return fail('sceneData.objects.operation.type', 'Unsupported Builder operation.')
  }
}

function initialWorkload(document: BuilderSceneDocument): Omit<BuilderWorkload, 'generatedSourceBytes'> {
  const objects = document.objects.length
  return {
    expandedPrimitives: document.objects.reduce((sum, object) => sum + policy.operationCosts[object.operation.type], 0),
    compositionOperations: Math.max(0, objects - 1) * policy.operationCosts.compositionPerAdditionalObject,
    transformOperations: objects * policy.operationCosts.transformPerObject,
    materialOperations: objects * policy.operationCosts.materialPerObject,
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
    const operation = operationSource(object)
    objects.push([
      `let builder_object_${objectIndex}=shape(()=>{`,
      `displace(${read('position.x')},${read('position.y')},${read('position.z')});`,
      `rotateX(${read('rotation.x')});rotateY(${read('rotation.y')});rotateZ(${read('rotation.z')});`,
      `let builder_space_${objectIndex}=getSpace();`,
      `setSpace(vec3(builder_space_${objectIndex}.x/${scaleX},builder_space_${objectIndex}.y/${scaleY},builder_space_${objectIndex}.z/${scaleZ}));`,
      `color(${literal(red)},${literal(green)},${literal(blue)});`,
      `metal(${read('material.metalness')});shine(${read('material.shininess')});`,
      `let builder_distance_${objectIndex}=extractSDF(${operation.operation})(${operation.arguments});`,
      `setSDF(builder_distance_${objectIndex}*min(${scaleX},min(${scaleY},${scaleZ})));`,
      `});builder_object_${objectIndex}();`,
    ].join(''))
  })

  const shader = [`setMaxIterations(96);setStepSize(0.7);`, ...declarations, ...objects].join('\n')
  const workload: BuilderWorkload = { ...baseWorkload, generatedSourceBytes: encoder.encode(shader).byteLength }
  assertBudget(workload)
  return Object.freeze({ compilerVersion: BUILDER_COMPILER_VERSION, shader,
    uniforms: Object.freeze(uniforms.map(uniform => Object.freeze(uniform))), workload: Object.freeze(workload) })
}
