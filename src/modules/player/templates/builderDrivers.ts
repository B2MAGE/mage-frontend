import schema from '../../../../contracts/scenes/scene-v1.schema.json'
import policy from '../../../../contracts/scenes/builder-rendering.v1.json'
import { BUILDER_BINDING_RANGES, BUILDER_GROUP_RANGES, builderOperationFields } from './builderDefinitions'
import type { BuilderDriverExpression, BuilderGroup, BuilderObject, BuilderSceneDocument } from './sceneContract'

type Fail = (path: string, detail: string) => never
type ValueType = 'scalar' | 'vector'
export const BUILDER_DRIVER_LIMITS = policy.driverLimits
const sources = new Set(schema.$defs.builderDriverExpression.anyOf
  .find(branch => branch.properties.type.const === 'input')!.properties.source!.enum)
const spatialSources = new Set(['local-position', 'group-position', 'world-position', 'view-ray'])
const axes = ['x', 'y', 'z']
const defaultFail: Fail = (path, detail) => { throw new Error(`${path}: ${detail}`) }

/** Targets refer to actual editable properties, never generated uniform names. */
export function builderDriverTargetRange(node: BuilderObject | BuilderGroup, target: string): { minimum: number; maximum: number } | null {
  if ('children' in node) {
    if (target === 'blend' && node.operation.type !== 'smooth-union') return null
    if (target.startsWith('material.') && !node.material) return null
    return Object.hasOwn(BUILDER_GROUP_RANGES, target)
      ? BUILDER_GROUP_RANGES[target as keyof typeof BUILDER_GROUP_RANGES] : null
  }
  if (target.startsWith('operation.')) {
    return builderOperationFields(node.operation).find(field => `operation.${field.key}` === target) ?? null
  }
  return Object.hasOwn(BUILDER_BINDING_RANGES, target)
    ? BUILDER_BINDING_RANGES[target as keyof typeof BUILDER_BINDING_RANGES] : null
}

function plain(value: unknown, path: string, allowed: readonly string[], fail: Fail): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected a driver expression object')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return fail(path, 'expected plain driver data')
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) {
      return fail(path, 'unknown field or unsupported driver property')
    }
  }
  return value as Record<string, unknown>
}

function bounded(value: unknown, path: string, fail: Fail): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > BUILDER_DRIVER_LIMITS.constantMagnitude) {
    return fail(path, `expected a finite number between -${BUILDER_DRIVER_LIMITS.constantMagnitude} and ${BUILDER_DRIVER_LIMITS.constantMagnitude}`)
  }
  return value
}

export type BuilderDriverExpressionInfo = { type: ValueType; nodes: number; constants: number; signals: Set<string>; spatial: boolean }

/** Independent compiler validation runs before expansion or source allocation. */
export function validateBuilderDriverExpression(value: unknown, path = 'expression', fail: Fail = defaultFail): BuilderDriverExpressionInfo {
  let nodes = 0, constants = 0, spatial = false
  const signals = new Set<string>()
  const visit = (input: unknown, at: string, depth: number): ValueType => {
    if (depth > BUILDER_DRIVER_LIMITS.expressionDepth) return fail(at, `driver expression depth exceeds ${BUILDER_DRIVER_LIMITS.expressionDepth}`)
    if (++nodes > BUILDER_DRIVER_LIMITS.expressionNodes) return fail(at, `driver expression exceeds ${BUILDER_DRIVER_LIMITS.expressionNodes} nodes`)
    // Inspect the discriminant as a data descriptor before reading any authored value.
    const type = input && typeof input === 'object' ? Object.getOwnPropertyDescriptor(input, 'type')?.value : undefined
    const fields: Record<string, readonly string[]> = {
      constant: ['type', 'value'], input: ['type', 'source'], add: ['type', 'left', 'right'], multiply: ['type', 'left', 'right'],
      sin: ['type', 'input'], cos: ['type', 'input'], clamp: ['type', 'input', 'min', 'max'], component: ['type', 'input', 'axis'],
    }
    if (typeof type !== 'string' || !Object.hasOwn(fields, type)) return fail(at, 'unsupported driver operation')
    const expression = plain(input, at, fields[type], fail)
    switch (type) {
      case 'constant': {
        if (typeof expression.value === 'number') { bounded(expression.value, `${at}.value`, fail); constants++; return 'scalar' }
        const vector = plain(expression.value, `${at}.value`, axes, fail)
        for (const axis of axes) bounded(vector[axis], `${at}.value.${axis}`, fail)
        constants += 3
        return 'vector'
      }
      case 'input': {
        if (typeof expression.source !== 'string' || !sources.has(expression.source)) return fail(`${at}.source`, 'unsupported driver input')
        if (spatialSources.has(expression.source)) { spatial = true; return 'vector' }
        if (expression.source !== 'time') signals.add(expression.source)
        return 'scalar'
      }
      case 'add': case 'multiply': {
        const left = visit(expression.left, `${at}.left`, depth + 1)
        const right = visit(expression.right, `${at}.right`, depth + 1)
        if (type === 'add' && left !== right) return fail(at, 'add requires matching scalar or vector values')
        return left === 'vector' || right === 'vector' ? 'vector' : 'scalar'
      }
      case 'sin': case 'cos': return visit(expression.input, `${at}.input`, depth + 1)
      case 'clamp': {
        const minimum = bounded(expression.min, `${at}.min`, fail)
        const maximum = bounded(expression.max, `${at}.max`, fail)
        if (minimum > maximum) return fail(at, 'driver minimum must not exceed maximum')
        constants += 2
        return visit(expression.input, `${at}.input`, depth + 1)
      }
      case 'component': {
        if (typeof expression.axis !== 'string' || !axes.includes(expression.axis)) return fail(`${at}.axis`, 'expected x, y, or z')
        if (visit(expression.input, `${at}.input`, depth + 1) !== 'vector') return fail(at, 'component requires a vector input')
        return 'scalar'
      }
      default: return fail(at, 'unsupported driver operation')
    }
  }
  const type = visit(value, path, 1)
  return { type, nodes, constants, signals, spatial }
}

export function validateBuilderDrivers(document: BuilderSceneDocument, fail: Fail = defaultFail) {
  let driverOperations = 0, authoredDrivers = 0, constants = 0
  const signals = new Set<string>()
  const visitNode = (node: BuilderObject | BuilderGroup, path: string, copies: number) => {
    if (node.drivers === undefined) return
    if (!Array.isArray(node.drivers) || node.drivers.length > BUILDER_DRIVER_LIMITS.perNode) return fail(path, `expected at most ${BUILDER_DRIVER_LIMITS.perNode} drivers`)
    node.drivers.forEach((driver, index) => {
      const at = `${path}[${index}]`
      const data = plain(driver, at, ['target', 'mode', 'expression'], fail)
      if (typeof data.target !== 'string' || !builderDriverTargetRange(node, data.target)) return fail(`${at}.target`, 'property is unavailable on this object or group')
      if (typeof data.mode !== 'string' || !['add', 'replace', 'multiply'].includes(data.mode)) return fail(`${at}.mode`, 'unsupported driver composition mode')
      const info = validateBuilderDriverExpression(data.expression, `${at}.expression`, fail)
      if (info.type !== 'scalar') return fail(`${at}.expression`, 'this property requires a scalar value; select a vector component')
      driverOperations += info.nodes * copies
      authoredDrivers++
      constants += info.constants
      info.signals.forEach(source => signals.add(source))
      if (authoredDrivers > policy.limits.authoredDrivers) return fail(path, `scene exceeds ${policy.limits.authoredDrivers} drivers`)
      if (driverOperations > policy.limits.driverOperations) return fail(path, `expanded driver work exceeds ${policy.limits.driverOperations} operations`)
    })
  }
  document.objects.forEach((node, index) => visitNode(node, `scene.objects[${index}].drivers`,
    node.arrangements.reduce((count, arrangement) => count * arrangement.count, 1)))
  document.composition?.groups.forEach((node, index) => visitNode(node, `scene.composition.groups[${index}].drivers`, 1))
  const driverUniforms = constants + signals.size
  const bindings = document.objects.reduce((count, object) => count + object.bindings.length, 0)
  if (driverUniforms + bindings > policy.limits.liveUniforms) fail('scene.objects.drivers', `required live values exceed ${policy.limits.liveUniforms} uniforms`)
  return { driverOperations, authoredDrivers, driverUniforms }
}

/** Exposed for typed editors without turning imported expressions into source. */
export function builderDriverExpressionIsSpatial(expression: BuilderDriverExpression): boolean {
  return validateBuilderDriverExpression(expression).spatial
}
