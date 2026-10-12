import type { BuilderDriverExpression } from '@modules/player'
import { DRIVER_SOURCES } from './builderDrivers'

export type Expression = BuilderDriverExpression
export type ExpressionValueType = 'scalar' | 'vector'
export const VECTOR_INPUTS = [
  { value: 'scene-pointer', label: 'Scene pointer (XYZ)' },
  { value: 'local-position', label: 'Local position (XYZ)' },
  { value: 'group-position', label: 'Parent group position (XYZ)' },
  { value: 'world-position', label: 'World position (XYZ)' },
  { value: 'view-ray', label: 'View ray (XYZ)' },
] as const
export const SCALAR_INPUTS = DRIVER_SOURCES.filter(source => !source.value.includes('.'))

/** Structural typing also works while a numeric range is temporarily invalid. */
export function expressionValueType(expression: Expression): ExpressionValueType {
  switch (expression.type) {
    case 'constant': return typeof expression.value === 'number' ? 'scalar' : 'vector'
    case 'input': return VECTOR_INPUTS.some(input => input.value === expression.source) ? 'vector' : 'scalar'
    case 'component': return 'scalar'
    case 'add': case 'multiply': return expressionValueType(expression.left) === 'vector' || expressionValueType(expression.right) === 'vector' ? 'vector' : 'scalar'
    default: return expressionValueType(expression.input)
  }
}

export function expressionConstant(type: ExpressionValueType, value: number): Expression {
  return { type: 'constant', value: type === 'scalar' ? value : { x: value, y: value, z: value } }
}

/** Wrap the existing value when adding an operation, instead of losing its inputs. */
export function changeExpressionOperation(expression: Expression, type: Expression['type']): Expression {
  if (expression.type === type) return expression
  const valueType = expressionValueType(expression)
  switch (type) {
    case 'constant': return expressionConstant(valueType, 0)
    case 'input': return { type, source: valueType === 'scalar' ? 'time' : 'local-position' }
    case 'add': return { type, left: expression, right: expressionConstant(valueType, 0) }
    case 'multiply': return { type, left: expression, right: expressionConstant('scalar', 1) }
    case 'sin': case 'cos': return { type, input: expression.type === 'sin' || expression.type === 'cos' ? expression.input : expression }
    case 'clamp': return { type, input: expression, min: -1, max: 1 }
    case 'component': return { type, input: { type: 'input', source: 'local-position' }, axis: 'x' }
  }
}

export function expressionBudget(expression: Expression): { nodes: number; depth: number } {
  const children = expression.type === 'add' || expression.type === 'multiply' ? [expression.left, expression.right]
    : 'input' in expression ? [expression.input] : []
  const budgets = children.map(expressionBudget)
  return { nodes: 1 + budgets.reduce((sum, child) => sum + child.nodes, 0), depth: 1 + Math.max(0, ...budgets.map(child => child.depth)) }
}

export function expressionSummary(expression: Expression): string {
  switch (expression.type) {
    case 'constant': return typeof expression.value === 'number' ? String(Number(expression.value.toPrecision(4)))
      : `XYZ (${expression.value.x}, ${expression.value.y}, ${expression.value.z})`
    case 'input': return [...SCALAR_INPUTS, ...VECTOR_INPUTS].find(input => input.value === expression.source)?.label ?? expression.source
    case 'add': case 'multiply': return `(${expressionSummary(expression.left)} ${expression.type === 'add' ? '+' : '×'} ${expressionSummary(expression.right)})`
    case 'sin': case 'cos': return `${expression.type === 'sin' ? 'Sine' : 'Cosine'}(${expressionSummary(expression.input)})`
    case 'clamp': return `Limit(${expressionSummary(expression.input)}, ${expression.min}, ${expression.max})`
    case 'component': return `${expressionSummary(expression.input)} → ${expression.axis.toUpperCase()}`
  }
}
