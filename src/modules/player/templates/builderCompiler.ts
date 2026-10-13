import policy from '../../../../contracts/scenes/builder-rendering.v1.json'
import { templateOptionalEffectCount } from './templateSettings'
import { BUILDER_BINDING_RANGES, BUILDER_GROUP_RANGES, BUILDER_RENDER_SETTINGS, type BuilderGroupTarget } from './builderDefinitions'
import { builderCompositionNodes, builderCompositionRoots, validateBuilderComposition } from './builderComposition'
import { builderLiveBindings, type BuilderLiveBinding } from './builderBindings'
import { usesSceneDimensions, validateBuilderDrivers } from './builderDrivers'
import { createBuilderDriverCompilation } from './builderDriverCompiler'
import { builderColorChannels } from './builderColor'
import type { BuilderArrangement, BuilderBinding, BuilderDriverExpression, BuilderFrame, BuilderGroup, BuilderMaterial, BuilderObject, BuilderSceneDocument, BuilderVector } from './sceneContract'

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
  groups: number
  groupDepth: number
  driverOperations: number
  authoredDrivers: number
}>

type UniformValue = {
  name: string
  initialValue: number
  minimum: number
  maximum: number
}
export type BuilderUniform = Readonly<UniformValue & ({
  objectId: string
  objectIndex: number
  target: BuilderBinding['target']
} | { groupId: string; groupIndex: number; target: BuilderGroupTarget }
  | { driverSlot: number; target: 'driver-value' }
  | { driverSlot: number; target: 'driver-signal'; source: BuilderBinding['source'] })>

export type BuilderCompilation = Readonly<{
  compilerVersion: typeof BUILDER_COMPILER_VERSION
  shader: string
  uniforms: readonly BuilderUniform[]
  bindings: readonly BuilderLiveBinding[]
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

function groupPropertyValue(group: BuilderGroup, target: BuilderGroupTarget): number {
  if (target === 'scale') return group.transform.scale
  if (target === 'blend') return group.operation.type === 'smooth-union' ? group.operation.blend : 0
  const [branch, field] = target.split('.') as ['position' | 'rotation' | 'material', string]
  if (branch === 'material') return group.material![field as 'metalness' | 'shininess']
  return group.transform[branch][field as 'x' | 'y' | 'z']
}

/** Uniform names depend only on the validated object position and target enum. */
export function builderUniformName(objectIndex: number, target: BuilderBinding['target']): string {
  if (!Number.isSafeInteger(objectIndex) || objectIndex < 0 || objectIndex >= policy.limits.expandedPrimitives) {
    fail('sceneData.objects', 'Object index exceeds the Builder rendering budget.')
  }
  return `builder_o${objectIndex}_${TARGET_TOKENS[target]}`
}

export function builderGroupUniformName(groupIndex: number, target: BuilderGroupTarget): string {
  if (!Number.isSafeInteger(groupIndex) || groupIndex < 0 || groupIndex >= policy.limits.groups
    || !Object.hasOwn(BUILDER_GROUP_RANGES, target)) fail('sceneData.composition.groups', 'Invalid group live property.')
  return `builder_g${groupIndex}_${target.replace('.', '_')}`
}

/** Shader Park's mirrorN keeps the fractional exponent, rather than rounding levels. */
function latticeOffsets(iterations: number): number[] {
  return Array.from({ length: Math.floor(iterations) }, (_, index) => 2 ** (iterations - 1 - index))
}

/** The exact box-frame distance uses three edge families, including thick/filled frames. */
function frameDistanceSource(suffix: string, dimensions: [string, string, string], thickness: string, expansion = '0'): string {
  const p = `builder_frame_delta_${suffix}`, q = `builder_frame_edges_${suffix}`
  const edge = (components: string[]) => {
    const outside = `vec3(${components.map(value => `max(${value},0)`).join(',')})`
    return `(length(${outside})+min(max(${components[0]},max(${components[1]},${components[2]})),0))`
  }
  return [
    `let ${p}=abs(getSpace())-vec3(${dimensions.join(',')});`,
    `let ${q}=abs(${p}+vec3(${thickness}))-vec3(${thickness});`,
    `let builder_distance_${suffix}=min(min(${edge([`${p}.x`, `${q}.y`, `${q}.z`])},${edge([`${q}.x`, `${p}.y`, `${q}.z`])}),${edge([`${q}.x`, `${q}.y`, `${p}.z`])})-${expansion};`,
  ].join('')
}

function primitiveDistanceSource(object: BuilderObject, suffix: string, read: (target: string, base: string) => string = (_target, base) => base): string {
  const operation = object.operation
  const dimension = (key: string, value: number) => read(`operation.${key}`, literal(value))
  switch (operation.type) {
    case 'sphere': return `let builder_distance_${suffix}=extractSDF(sphere)(${dimension('radius', operation.radius)});`
    case 'box': {
      // Shader Park's generated compiler does not expose its `box` helper inside
      // a dedicated browser Worker. Emit the equivalent allowlisted SDF math so
      // Builder boxes compile in the same isolated path used in production.
      const space = `builder_box_space_${suffix}`
      const delta = `builder_box_delta_${suffix}`
      const outside = `builder_box_outside_${suffix}`
      return [
        `let ${space}=getSpace();`,
        `let ${delta}=abs(${space})-vec3(${dimension('width', operation.width)},${dimension('height', operation.height)},${dimension('depth', operation.depth)});`,
        `let ${outside}=vec3(max(${delta}.x,0),max(${delta}.y,0),max(${delta}.z,0));`,
        `let builder_distance_${suffix}=min(max(${delta}.x,max(${delta}.y,${delta}.z)),0)+length(${outside});`,
      ].join('')
    }
    case 'torus': return `let builder_distance_${suffix}=extractSDF(torus)(${dimension('radius', operation.radius)},${dimension('tube', operation.tube)});`
    case 'cylinder': return `let builder_distance_${suffix}=extractSDF(cylinder)(${dimension('radius', operation.radius)},${dimension('height', operation.height)});`
    case 'box-frame': return frameDistanceSource(suffix,
      [dimension('width', operation.width), dimension('height', operation.height), dimension('depth', operation.depth)], dimension('thickness', operation.thickness))
    case 'lattice': {
      const spacing = dimension('spacing', operation.spacing)
      return latticeOffsets(operation.iterations).map(offset =>
        `setSpace(abs(getSpace())-vec3(${spacing}*${literal(offset)}));`).join('')
        + frameDistanceSource(suffix, [spacing, spacing, spacing], '0', dimension('thickness', operation.thickness))
    }
    default: return fail('sceneData.objects.operation.type', 'Unsupported Builder operation.')
  }
}

/** Position-driven frames vary along the march; their bounds cannot be treated as fixed geometry. */
function hasPositionDriver(node: BuilderObject | BuilderGroup): boolean {
  const visit = (expression: BuilderDriverExpression): boolean => {
    switch (expression.type) {
      case 'input': return ['local-position', 'group-position', 'world-position'].includes(expression.source)
      case 'add': case 'multiply': return visit(expression.left) || visit(expression.right)
      case 'component': case 'sin': case 'cos': case 'noise': case 'clamp': return visit(expression.input)
      default: return false
    }
  }
  return node.drivers?.some(driver => visit(driver.expression)) ?? false
}

/**
 * An enclosing box is also a conservative distance bound. Taking the larger
 * lower bound lets thin objects skip empty space without shrinking every step
 * by their smallest scale. Primitive surfaces and authored scale limits stay
 * unchanged. Twists preserve radius in their rotation plane, so reverse those
 * coordinate stages after padding the primitive for expand/shell modifiers.
 */
function objectBoundSource(object: BuilderObject, suffix: string, scale: [string, string, string], read: (target: string, base: string) => string): string {
  const operation = object.operation
  const dimension = (key: string, value: number) => read(`operation.${key}`, literal(value))
  let bounds: [string, string, string]
  switch (operation.type) {
    case 'sphere': bounds = Array(3).fill(dimension('radius', operation.radius)) as [string, string, string]; break
    case 'box': case 'box-frame': bounds = [dimension('width', operation.width), dimension('height', operation.height), dimension('depth', operation.depth)]; break
    case 'torus': {
      const radius = dimension('radius', operation.radius), tube = dimension('tube', operation.tube)
      bounds = [`(${radius}+${tube})`, tube, `(${radius}+${tube})`]; break
    }
    case 'cylinder': bounds = [dimension('radius', operation.radius), dimension('height', operation.height), dimension('radius', operation.radius)]; break
    case 'lattice': {
      const extent = `(${dimension('spacing', operation.spacing)}*${literal(1 + latticeOffsets(operation.iterations).reduce((sum, offset) => sum + offset, 0))}+${dimension('thickness', operation.thickness)})`
      bounds = [extent, extent, extent]; break
    }
  }
  const padding = object.modifiers.reduce((total, modifier) => total
    + (modifier.type === 'expand' ? Math.max(0, modifier.amount) : modifier.type === 'shell' ? modifier.thickness : 0), 0)
  if (padding) bounds = bounds.map(value => `(${value}+${literal(padding)})`) as typeof bounds
  const declarations: string[] = []
  for (let index = object.modifiers.length - 1; index >= 0; index--) {
    const modifier = object.modifiers[index]
    if (modifier.type !== 'twist') continue
    const axes = modifier.axis === 'x' ? [1, 2] : modifier.axis === 'y' ? [0, 2] : [0, 1]
    const name = `builder_bound_radius_${suffix}_${index}`
    declarations.push(`let ${name}=length(vec3(${bounds[axes[0]]},${bounds[axes[1]]},0));`)
    bounds[axes[0]] = name; bounds[axes[1]] = name
  }
  const delta = `builder_bound_delta_${suffix}`, outside = `builder_bound_outside_${suffix}`
  return [...declarations,
    `let ${delta}=abs(builder_space_${suffix})-vec3(${bounds.map((value, index) => `(${value}*${scale[index]})`).join(',')});`,
    `let ${outside}=vec3(max(${delta}.x,0),max(${delta}.y,0),max(${delta}.z,0));`,
    `let builder_bound_distance_${suffix}=length(${outside})+min(max(${delta}.x,max(${delta}.y,${delta}.z)),0);`,
  ].join('')
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

function modifierExpression(owner: BuilderObject | BuilderGroup, distance: string,
  read: (target: string, baseline: string) => string, scale = '1'): string {
  const amount = (target: string, value: number) => {
    const result = read(target, literal(value))
    return scale === '1' ? result : `(${result}*${scale})`
  }
  return (owner.modifiers ?? []).reduce((expression, modifier) => modifier.type === 'expand'
    ? `(${expression}-${amount('modifier.expand.amount', modifier.amount)})`
    : modifier.type === 'shell' ? `(abs(${expression})-${amount('modifier.shell.thickness', modifier.thickness)})` : expression, distance)
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
  const drivers = validateBuilderDrivers(document, fail)
  const driverCompilation = createBuilderDriverCompilation(document, false)
  // Count before allocating copies or emitting source. Every stage repeats the
  // result of the previous stage, so counts multiply rather than add.
  const expandedCounts = document.objects.map(object => object.arrangements
    .reduce((count, arrangement) => count * arrangement.count, 1))
  const expandedPrimitives = expandedCounts.reduce((sum, count) => sum + count, 0)
  const groups = document.composition?.groups ?? []
  const nodes = builderCompositionNodes(document)
  const depth = (id: string): number => {
    const node = nodes.get(id)!
    return node.kind === 'object' ? 0 : 1 + Math.max(0, ...node.group.children.map(depth))
  }
  return {
    expandedPrimitives,
    compositionOperations: Math.max(0, expandedPrimitives - 1) * policy.operationCosts.compositionPerAdditionalObject,
    transformOperations: (expandedPrimitives + groups.length + document.objects.filter(object => object.frame).length
      + document.objects.reduce((sum, object, index) => sum + (driverCompilation.hasLocal(object) ? expandedCounts[index] : 0), 0)
      + groups.filter(group => driverCompilation.hasLocal(group)).length)
      * policy.operationCosts.transformPerObject,
    materialOperations: (expandedPrimitives + groups.filter(group => group.material).length) * policy.operationCosts.materialPerObject,
    modifierOperations: document.objects.reduce((sum, object, index) => sum + expandedCounts[index] * object.modifiers.reduce((cost, modifier) =>
      cost + policy.operationCosts[modifier.type === 'expand' ? 'expandModifier'
        : modifier.type === 'shell' ? 'shellModifier' : 'twistModifier'],
    object.operation.type === 'box-frame' ? policy.operationCosts['box-frame']
      : object.operation.type === 'lattice' ? policy.operationCosts.lattice
        + Math.floor(object.operation.iterations) * policy.operationCosts.latticePerFold : 0), 0)
      + groups.reduce((sum, group) => sum + (group.modifiers ?? []).reduce((cost, modifier) => cost
        + policy.operationCosts[modifier.type === 'expand' ? 'expandModifier' : 'shellModifier'], 0), 0),
    arrangementOperations: document.objects.reduce((sum, _object, index) =>
      sum + Math.max(0, expandedCounts[index] - 1) * policy.operationCosts.arrangementPerAdditionalCopy, 0),
    animationOperations: document.objects.reduce((sum, object, index) =>
      sum + (object.motion.type === 'spin' ? expandedCounts[index] * policy.operationCosts.spinPerPrimitive : 0), 0),
    liveUniforms: document.objects.reduce((sum, object) => sum + object.bindings.length * policy.operationCosts.liveUniformPerBinding, drivers.driverUniforms),
    optionalEffects: templateOptionalEffectCount(document.settings),
    groups: groups.length,
    groupDepth: Math.max(0, ...builderCompositionRoots(document).map(depth)),
    driverOperations: drivers.driverOperations,
    authoredDrivers: drivers.authoredDrivers,
  }
}

function assertBudget(workload: Omit<BuilderWorkload, 'generatedSourceBytes'> & { generatedSourceBytes?: number }): void {
  for (const [field, maximum] of Object.entries(policy.limits)) {
    const value = workload[field as keyof BuilderWorkload]
    if (value !== undefined && value > maximum) fail('sceneData.objects', `${field} requires ${value}; maximum is ${maximum}.`)
  }
}

/** Shared preflight for storage and compilation; normalized data is required. */
export function validateBuilderRenderingWorkload(document: BuilderSceneDocument) {
  if (document.rendering) for (const key of ['maxIterations', 'stepSize'] as const) {
    const value = document.rendering[key], rule = BUILDER_RENDER_SETTINGS[key]
    if (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum
      || (key === 'maxIterations' && !Number.isInteger(value))) {
      fail(`sceneData.rendering.${key}`, `Expected ${key === 'maxIterations' ? 'an integer' : 'a finite number'} from ${rule.minimum} to ${rule.maximum}.`)
    }
  }
  builderLiveBindings(document)
  validateBuilderComposition(document, (path, detail) => fail(path.replace(/^scene\./, 'sceneData.'), detail))
  const workload = initialWorkload(document)
  assertBudget(workload)
  return workload
}

/**
 * Compile normalized Builder data into allowlisted Shader Park operations.
 * IDs, names and binding sources never enter generated source. Only validated
 * numeric values and fixed operation tokens are emitted.
 */
export function compileBuilderDocument(document: BuilderSceneDocument, options: { livePreview?: boolean; bindingUniformsOnly?: boolean } = {}): BuilderCompilation {
  const baseWorkload = validateBuilderRenderingWorkload(document)
  const drivers = createBuilderDriverCompilation(document, !!options.livePreview)
  const uniforms: BuilderUniform[] = [...drivers.uniforms]
  const declarations: string[] = [...drivers.declarations]
  const groups = document.composition?.groups ?? []

  // Saved compilation stays deterministic under version one's shared contract.
  // Playback can spend its remaining uniform budget on editor numeric values.
  // Authored bindings reserve their slots first; overflow stays structural.
  let remaining = policy.limits.liveUniforms - baseWorkload.liveUniforms
  const groupValues = groups.map((group, groupIndex) => {
    const values = new Map<BuilderGroupTarget, string>()
    if (options.livePreview && !options.bindingUniformsOnly) {
      for (const target of Object.keys(BUILDER_GROUP_RANGES) as BuilderGroupTarget[]) {
        if (!remaining || (target === 'blend' && group.operation.type !== 'smooth-union')
          || (target.startsWith('material.') && !group.material)) continue
        const range = BUILDER_GROUP_RANGES[target]
        const name = builderGroupUniformName(groupIndex, target)
        const initialValue = groupPropertyValue(group, target)
        declarations.push(`let ${name}=input(${literal(range.default)},${literal(range.minimum)},${literal(range.maximum)});`)
        uniforms.push({ groupId: group.id, groupIndex, target, name, initialValue, minimum: range.minimum, maximum: range.maximum })
        values.set(target, name)
        remaining--
      }
    }
    return values
  })
  const liveTargets = document.objects.map(object => {
    const targets = new Set(object.bindings.map(binding => binding.target))
    if (options.livePreview && !options.bindingUniformsOnly) for (const target of Object.keys(BUILDER_BINDING_RANGES) as BuilderBinding['target'][]) {
      if (remaining > 0 && !targets.has(target)) { targets.add(target); remaining-- }
    }
    return targets
  })

  const objectValues = document.objects.map((object, objectIndex) => {
    const values = new Map<BuilderBinding['target'], string>()
    const targets = (Object.keys(BUILDER_BINDING_RANGES) as BuilderBinding['target'][]).filter(target => liveTargets[objectIndex].has(target))
    targets.forEach(target => {
      const range = BUILDER_BINDING_RANGES[target]
      if (!range) fail(`sceneData.objects[${objectIndex}].bindings`, 'Unsupported live property target.')
      const name = builderUniformName(objectIndex, target)
      const initialValue = propertyValue(object, target)
      // Stable defaults keep supported edits on the same compiled program.
      // The trusted renderer applies actual values before its first frame.
      declarations.push(`let ${name}=input(${literal(options.livePreview ? range.default : initialValue)},${literal(range.minimum)},${literal(range.maximum)});`)
      uniforms.push({ objectId: object.id, objectIndex, target, name, initialValue,
        minimum: range.minimum, maximum: range.maximum })
      values.set(target, name)
    })
    return values
  })
  const objectRead = (index: number, target: BuilderBinding['target']) => objectValues[index].get(target)
    ?? literal(propertyValue(document.objects[index], target))
  const groupRead = (index: number, target: BuilderGroupTarget) => groupValues[index].get(target)
    ?? literal(groupPropertyValue(groups[index], target))

  /** Parent frames use forward scale → chosen rotation order → translation. */
  const frameSource = (suffix: string, read: (target: Exclude<BuilderGroupTarget, 'blend' | `material.${string}`>) => string, order: BuilderFrame['rotationOrder'] = 'xyz') => [
    `displace(${read('position.x')},${read('position.y')},${read('position.z')});`,
    // Shader Park rotates coordinates rather than the surface, with its Y
    // helper using the XZ plane. Reverse order/sign yields the chosen forward frame.
    [...order].reverse().map(axis => axis === 'y' ? `rotateY(-(${read('rotation.y')}));`
      : axis === 'x' ? `rotateX(${read('rotation.x')});` : `rotateZ(${read('rotation.z')});`).join(''),
    `let builder_frame_${suffix}=getSpace();setSpace(builder_frame_${suffix}/${read('scale')});`,
  ].join('')
  const constantFrameRead = (frame: BuilderFrame, target: Exclude<BuilderGroupTarget, 'blend' | `material.${string}`>) => {
    if (target === 'scale') return literal(frame.scale)
    const [branch, axis] = target.split('.') as ['position' | 'rotation', 'x' | 'y' | 'z']
    return literal(frame[branch][axis])
  }
  const multiply = (left: string, right: string) => left === '1' ? right : right === '1' ? left : `(${left}*${right})`
  type MaterialTarget = 'material.metalness' | 'material.shininess' | `material.color.${'r' | 'g' | 'b'}`
  type MaterialOverride = { material: BuilderMaterial; read: (target: MaterialTarget, baseline: string) => string }
  const objectSource = (objectIndex: number, distanceScale = '1', override?: MaterialOverride, ancestors: readonly string[] = [], parentHasFixedBounds = true) => {
    const object = document.objects[objectIndex]
    // Signed scene-response dimensions can collapse or invert an SDF primitive.
    // The authored positive-size box is not a valid bound during that motion.
    const hasFixedBounds = parentHasFixedBounds && !hasPositionDriver(object) && !object.drivers?.some(driver =>
      usesSceneDimensions(driver) || driver.target.startsWith('modifier.'))
    const channels = builderColorChannels(override?.material.color ?? object.material.color)
    return expandedOffsets(object).map((offset, copyIndex) => {
      const suffix = `${objectIndex}_${copyIndex}`
      const base = (target: BuilderBinding['target']) => objectRead(objectIndex, target)
      const localName = `builder_local_position_${suffix}`
      const driven = drivers.owner(object, `o${suffix}`, { world: 'builder_world_position', group: ancestors[0] ?? 'builder_world_position', local: localName, ancestors })
      const read = (target: BuilderBinding['target']) => driven.apply(target, base(target))
      const scaleX = read('scale.x'), scaleY = read('scale.y'), scaleZ = read('scale.z')
      const scale = multiply(`min(${scaleX},min(${scaleY},${scaleZ}))`, distanceScale)
      const materialRead = (target: MaterialTarget, baseline?: string) => {
        const value = baseline ?? base(target as 'material.metalness' | 'material.shininess')
        return override ? override.read(target, value) : driven.apply(target, value)
      }
      const spin = object.motion.type === 'spin' ? object.motion : null
      const baselineRotation = (axis: 'x' | 'y' | 'z') => spin?.axis === axis
        ? `(${base(`rotation.${axis}`)}+time*${literal(spin.speed)})` : base(`rotation.${axis}`)
      const rotation = (axis: 'x' | 'y' | 'z') => spin?.axis === axis
        ? `(${read(`rotation.${axis}`)}+time*${literal(spin.speed)})`
        : read(`rotation.${axis}`)
      return [
        `let builder_object_${suffix}=shape(()=>{`,
        drivers.hasLocal(object) ? [
          `let builder_parent_${suffix}=getSpace()+vec3(0);`,
          `displace((${base('position.x')}+${literal(offset.x)}),(${base('position.y')}+${literal(offset.y)}),(${base('position.z')}+${literal(offset.z)}));`,
          `rotateX(${baselineRotation('x')});rotateY(${baselineRotation('y')});rotateZ(${baselineRotation('z')});`,
          `let ${localName}=getSpace()/vec3(${base('scale.x')},${base('scale.y')},${base('scale.z')});`,
          `setSpace(builder_parent_${suffix});`,
        ].join('') : '',
        '__BUILDER_DRIVER_DECLARATIONS__',
        `displace((${read('position.x')}+${literal(offset.x)}),(${read('position.y')}+${literal(offset.y)}),(${read('position.z')}+${literal(offset.z)}));`,
        `rotateX(${rotation('x')});rotateY(${rotation('y')});rotateZ(${rotation('z')});`,
        `let builder_space_${suffix}=getSpace()${hasFixedBounds ? '+vec3(0)' : ''};`,
        `setSpace(vec3(builder_space_${suffix}.x/${scaleX},builder_space_${suffix}.y/${scaleY},builder_space_${suffix}.z/${scaleZ}));`,
        coordinateModifierSource(object, suffix),
        `color(${channels.map((value, index) => materialRead(`material.color.${(['r', 'g', 'b'] as const)[index]}`, literal(value))).join(',')});`,
        `metal(${materialRead('material.metalness')});shine(${materialRead('material.shininess')});`,
        primitiveDistanceSource(object, suffix, driven.apply),
        hasFixedBounds ? objectBoundSource(object, suffix, [scaleX, scaleY, scaleZ], driven.apply) : '',
        `setSDF(${hasFixedBounds ? `max(${modifierExpression(object, `builder_distance_${suffix}`, driven.apply)}*${scale},${multiply(`builder_bound_distance_${suffix}`, distanceScale)})`
          : `${modifierExpression(object, `builder_distance_${suffix}`, driven.apply)}*${scale}`});`,
        `});builder_object_${suffix}();`,
      ].join('').replace('__BUILDER_DRIVER_DECLARATIONS__', driven.declarations)
    }).join('\n')
  }

  const nodes = builderCompositionNodes(document)
  const nodeSource = (id: string, parentScale: string, inherited?: MaterialOverride, ancestors: readonly string[] = [], parentHasFixedBounds = true): { source: string; name: string } => {
    const node = nodes.get(id)!
    if (node.kind === 'object') {
      const frame = node.object.frame
      const name = `builder_leaf_${node.index}`
      return { name, source: [
        `let ${name}=shape(()=>{`,
        frame ? frameSource(`o${node.index}`, target => constantFrameRead(frame, target), frame.rotationOrder) : '',
        objectSource(node.index, frame ? multiply(parentScale, literal(frame.scale)) : parentScale, inherited, ancestors, parentHasFixedBounds),
        'return getSDF();});',
      ].join('') }
    }
    const { group, index } = node
    const name = `builder_group_${index}`
    const localName = `builder_local_group_${index}`
    const groupPosition = `builder_group_position_${index}`
    const driven = drivers.owner(group, `g${index}`, { world: 'builder_world_position', group: ancestors[0] ?? 'builder_world_position', local: localName, ancestors })
    const read = (target: BuilderGroupTarget) => driven.apply(target, groupRead(index, target))
    const scale = multiply(parentScale, read('scale'))
    const override = inherited ?? (group.material ? { material: group.material,
      read: (target: MaterialTarget, baseline: string) => target.startsWith('material.color.') ? driven.apply(target, baseline) : read(target as BuilderGroupTarget) } : undefined)
    const children = group.children.map(child => nodeSource(child, scale, override, [groupPosition, ...ancestors], parentHasFixedBounds && !hasPositionDriver(group)))
    const blend = group.operation.type === 'smooth-union' ? multiply(read('blend'), scale) : null
    const source = [
      `let ${name}=shape(()=>{`,
      drivers.hasLocal(group) ? [
        `let builder_group_parent_${index}=getSpace()+vec3(0);`,
        frameSource(`base_g${index}`, target => groupRead(index, target), group.transform.rotationOrder),
        `let ${localName}=getSpace()+vec3(0);setSpace(builder_group_parent_${index});`,
      ].join('') : '',
      '__BUILDER_DRIVER_DECLARATIONS__',
      frameSource(`g${index}`, read, group.transform.rotationOrder),
      drivers.spatial ? `let ${groupPosition}=getSpace()+vec3(0);` : '',
      ...children.flatMap((child, childIndex) => {
        if (!blend || childIndex === 0) return [child.source, `${child.name}();`]
        const suffix = `${index}_${childIndex}`
        const prior = `builder_prior_${suffix}`, next = `builder_next_${suffix}`, amount = `builder_blend_${suffix}`, h = `builder_h_${suffix}`
        return [
          // getSDF returns a reference. Addition captures its value before the
          // next child updates the group's distance/material accumulator.
          `let ${prior}=getSDF()+0;`, child.source, `let ${next}=${child.name}();`,
          `let ${amount}=${blend};`,
          // The denominator is one at zero and exactly k otherwise. This is
          // polynomial smooth minimum, with exact hard union at k=0.
          `let ${h}=max(${amount}-abs(${prior}-${next}),0)/(${amount}+(1-sign(${amount})));`,
          // Keep the nearer child material selected by the union above. The
          // smooth distance adjustment must not recolor the whole group.
          `mixMat(1);setSDF(min(${prior},${next})-${amount}*${h}*${h}*0.25);resetMixColor();`,
        ]
      }),
      // Native distance modifiers replace the accumulated distance. setSDF
      // would union with the previous distance, losing shrinkage and shell holes.
      ...(group.modifiers ?? []).map(modifier => modifier.type === 'expand'
        ? `expand(${multiply(driven.apply('modifier.expand.amount', literal(modifier.amount)), scale)});`
        : `shell(${multiply(driven.apply('modifier.shell.thickness', literal(modifier.thickness)), scale)});`),
      'return getSDF();});',
    ].join('').replace('__BUILDER_DRIVER_DECLARATIONS__', driven.declarations)
    return { source, name }
  }
  const objects = !document.composition && !document.objects.some(object => object.frame)
    ? document.objects.map((_object, index) => objectSource(index))
    : builderCompositionRoots(document).map(id => { const node = nodeSource(id, '1'); return `${node.source}${node.name}();` })

  const iterations = document.rendering?.maxIterations ?? BUILDER_RENDER_SETTINGS.maxIterations.default
  const stepSize = document.rendering?.stepSize ?? BUILDER_RENDER_SETTINGS.stepSize.default
  const shader = [`setMaxIterations(${literal(iterations)});setStepSize(${literal(stepSize)});`, ...declarations,
    ...(drivers.spatial ? ['let builder_world_position=getSpace()+vec3(0);'] : []), ...objects].join('\n')
  const workload: BuilderWorkload = { ...baseWorkload, liveUniforms: uniforms.length + drivers.nativeUniformCount, generatedSourceBytes: encoder.encode(shader).byteLength }
  assertBudget(workload)
  return Object.freeze({ compilerVersion: BUILDER_COMPILER_VERSION, shader,
    bindings: Object.freeze(builderLiveBindings(document).map(binding => Object.freeze(binding))),
    uniforms: Object.freeze(uniforms.map(uniform => Object.freeze(uniform))), workload: Object.freeze(workload) })
}

/** Extra editor uniforms must never make a valid saved scene exceed its source budget. */
export function compileBuilderPreviewDocument(document: BuilderSceneDocument): BuilderCompilation {
  try { return compileBuilderDocument(document, { livePreview: true }) }
  catch (error) {
    if (!(error instanceof BuilderCompilationError) || !error.message.includes('generatedSourceBytes requires')) throw error
    return compileBuilderDocument(document, { livePreview: true, bindingUniformsOnly: true })
  }
}
