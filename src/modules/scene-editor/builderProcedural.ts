import { BUILDER_DRIVER_LIMITS, type BuilderDriver, type BuilderDriverExpression, type BuilderGroup, type BuilderObject, type BuilderVector } from '@modules/player'

type Expression = BuilderDriverExpression
type Node = BuilderObject | BuilderGroup
export type NoiseValues = {
  scope: 'local-position' | 'group-position' | 'world-position' | 'view-ray'
  ancestor: number
  frequency: number
  strength: number
  offset: BuilderVector
  drift: BuilderVector
}
const zero = (): BuilderVector => ({ x: 0, y: 0, z: 0 })
const isZero = (value: BuilderVector) => Object.values(value).every(channel => channel === 0)
const constant = (value: number | BuilderVector): Expression => ({ type: 'constant', value })
const multiply = (left: Expression, right: Expression): Expression => ({ type: 'multiply', left, right })
export function defaultNoiseValues(): NoiseValues {
  return { scope: 'local-position', ancestor: 1, frequency: 2, strength: .15, offset: zero(), drift: zero() }
}

/** Convenient controls create ordinary expressions, including the same noise node available in Combined inputs. */
export function createNoiseExpression(values: NoiseValues): Expression {
  let coordinates: Expression = multiply({ type: 'input', source: values.scope,
    ...(values.scope === 'group-position' && values.ancestor !== 1 ? { ancestor: values.ancestor } : {}) }, constant(values.frequency))
  if (!isZero(values.offset)) coordinates = { type: 'add', left: coordinates, right: constant(values.offset) }
  if (!isZero(values.drift)) coordinates = { type: 'add', left: coordinates,
    right: multiply({ type: 'input', source: 'time' }, constant(values.drift)) }
  return multiply({ type: 'noise', input: coordinates }, constant(values.strength))
}

export function readNoiseExpression(expression: Expression): NoiseValues | null {
  const noise = expression.type === 'noise' ? expression : expression.type === 'multiply' && expression.left.type === 'noise' ? expression.left : null
  const strength = expression.type === 'noise' ? 1 : expression.type === 'multiply' && expression.right.type === 'constant'
    && typeof expression.right.value === 'number' ? expression.right.value : null
  if (!noise || strength === null) return null
  let coordinates = noise.input
  const values = { ...defaultNoiseValues(), strength }
  if (coordinates.type === 'add' && coordinates.right.type === 'multiply'
    && coordinates.right.left.type === 'input' && coordinates.right.left.source === 'time'
    && coordinates.right.right.type === 'constant' && typeof coordinates.right.right.value !== 'number') {
    values.drift = coordinates.right.right.value
    coordinates = coordinates.left
  }
  if (coordinates.type === 'add' && coordinates.right.type === 'constant' && typeof coordinates.right.value !== 'number') {
    values.offset = coordinates.right.value
    coordinates = coordinates.left
  }
  if (coordinates.type !== 'multiply' || coordinates.left.type !== 'input' || coordinates.right.type !== 'constant'
    || typeof coordinates.right.value !== 'number'
    || !['local-position', 'group-position', 'world-position', 'view-ray'].includes(coordinates.left.source)) return null
  return { ...values, scope: coordinates.left.source as NoiseValues['scope'], ancestor: coordinates.left.ancestor ?? 1,
    frequency: coordinates.right.value }
}

export function addNoiseDeformation<T extends Node>(node: T): T {
  if ((node.drivers?.length ?? 0) >= BUILDER_DRIVER_LIMITS.perNode) return node
  const modifiers = node.modifiers ?? []
  return { ...node, modifiers: modifiers.some(modifier => modifier.type === 'expand') ? modifiers : [...modifiers, { type: 'expand', amount: 0 }],
    drivers: [...(node.drivers ?? []), { target: 'modifier.expand.amount', mode: 'add', expression: createNoiseExpression(defaultNoiseValues()) }] }
}

export function colorDrivers(kind: 'view-ray' | 'animated'): BuilderDriver[] {
  return (['x', 'y', 'z'] as const).map((axis, index) => ({ target: `material.color.${['r', 'g', 'b'][index]}` as BuilderDriver['target'], mode: 'replace',
    expression: kind === 'view-ray' ? { type: 'component', input: { type: 'input', source: 'view-ray' }, axis }
      : { type: 'add', left: constant(.5), right: multiply(constant(.5), { type: 'sin', input: {
        type: 'add', left: { type: 'input', source: 'time' }, right: constant(index * Math.PI * 2 / 3),
      } }) } }))
}

export function addProceduralColor<T extends Node>(node: T, kind: 'view-ray' | 'animated'): T {
  if (!node.material || (node.drivers?.length ?? 0) + 3 > BUILDER_DRIVER_LIMITS.perNode) return node
  return { ...node, drivers: [...(node.drivers ?? []), ...colorDrivers(kind)] }
}
