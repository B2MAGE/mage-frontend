import type { BuilderDriverExpression } from '@modules/player'
import { SCALAR_INPUTS, VECTOR_INPUTS } from './builderInputDefinitions'

export { SCALAR_INPUTS, VECTOR_INPUTS } from './builderInputDefinitions'

export type Expression = BuilderDriverExpression
export type ExpressionValueType = 'scalar' | 'vector'
export const EXPRESSION_OPERATION_LABELS = {
  constant: 'Fixed value', input: 'Input', add: 'Add two values', multiply: 'Multiply two values',
  sin: 'Sine wave', cos: 'Cosine wave', clamp: 'Limit range', component: 'Take X, Y or Z', noise: '3D noise',
} satisfies Record<Expression['type'], string>

/** Structural typing also works while a numeric range is temporarily invalid. */
export function expressionValueType(expression: Expression): ExpressionValueType {
  switch (expression.type) {
    case 'constant': return typeof expression.value === 'number' ? 'scalar' : 'vector'
    case 'input': return VECTOR_INPUTS.some(input => input.value === expression.source) ? 'vector' : 'scalar'
    case 'component': case 'noise': return 'scalar'
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
    case 'noise': return { type, input: valueType === 'vector' ? expression : { type: 'input', source: 'local-position' } }
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
    case 'input': return expression.source === 'group-position' && (expression.ancestor ?? 1) > 1 ? `Group position (${expression.ancestor} groups up)`
      : [...SCALAR_INPUTS, ...VECTOR_INPUTS].find(input => input.value === expression.source)?.label ?? expression.source
    case 'add': case 'multiply': return `(${expressionSummary(expression.left)} ${expression.type === 'add' ? '+' : '×'} ${expressionSummary(expression.right)})`
    case 'sin': case 'cos': return `${expression.type === 'sin' ? 'Sine' : 'Cosine'}(${expressionSummary(expression.input)})`
    case 'clamp': return `Limit(${expressionSummary(expression.input)}, ${expression.min}, ${expression.max})`
    case 'component': return `${expressionSummary(expression.input)} → ${expression.axis.toUpperCase()}`
    case 'noise': return `Noise(${expressionSummary(expression.input)})`
  }
}
