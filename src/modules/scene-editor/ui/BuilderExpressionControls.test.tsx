import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BUILDER_DRIVER_LIMITS, validateBuilderDriverExpression } from '@modules/player'
import { expressionBudget, type Expression, VECTOR_INPUTS } from '../builderExpressions'
import { BuilderExpressionControls } from './BuilderExpressionControls'

const constant = (value: number): Expression => ({ type: 'constant', value })
const input = (source: Extract<Expression, { type: 'input' }>['source']): Expression => ({ type: 'input', source })
const add = (left: Expression, right: Expression): Expression => ({ type: 'add', left, right })
const multiply = (left: Expression, right: Expression): Expression => ({ type: 'multiply', left, right })

function setup(initial: Expression) {
  const changed = vi.fn<(expression: Expression) => void>()
  function Harness() {
    const [value, setValue] = useState(initial)
    return <BuilderExpressionControls id="expression" value={value} onChange={next => { changed(next); setValue(next) }} />
  }
  render(<Harness />)
  return { user: userEvent.setup(), changed, current: () => changed.mock.calls.at(-1)?.[0] ?? initial }
}

const calculation = (suffix = '') => screen.getByLabelText('Calculation', { selector: `#expression${suffix}-operation` })
const source = (suffix = '') => screen.getByLabelText('Input', { selector: `#expression${suffix}-source` })
const options = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map(option => option.value)
const summary = (field: HTMLElement) => field.closest('details')!.querySelector('summary')!

function waveChain(depth: number): Expression {
  return depth === 1 ? input('time') : { type: 'sin', input: waveChain(depth - 1) }
}

function additionTree(depth: number): Expression {
  return depth === 1 ? constant(.1) : add(additionTree(depth - 1), additionTree(depth - 1))
}

describe('Builder combined input controls', () => {
  it('opens existing formulas without changing them and preserves their children when wrapping a calculation', async () => {
    const initial = add(input('time'), multiply(input('bass-level'), constant(2)))
    const before = structuredClone(initial)
    const { user, changed, current } = setup(initial)
    await user.click(summary(calculation('-left')))
    await user.click(summary(calculation('-right')))
    await user.click(summary(calculation('-right-left')))
    await user.click(summary(calculation('-right-right')))
    expect(changed).not.toHaveBeenCalled()
    expect(initial).toEqual(before)

    await user.selectOptions(calculation(), 'multiply')
    expect(current()).toEqual(multiply(initial, constant(1)))
    expect((current() as Extract<Expression, { type: 'add' | 'multiply' }>).left).toBe(initial)
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    expect(initial).toEqual(before)
  })

  it('offers scalar inputs until a component explicitly opens an XYZ input and keeps that output scalar', async () => {
    const { user, current } = setup(input('time'))
    expect(options(source())).toEqual(expect.arrayContaining(['time', 'scene-size', 'scene-pointer-down', 'bass-hit', 'pointer-x']))
    for (const vector of VECTOR_INPUTS) expect(options(source())).not.toContain(vector.value)

    await user.selectOptions(calculation(), 'component')
    expect(current()).toEqual({ type: 'component', axis: 'x', input: input('local-position') })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    await user.click(summary(source('-input')))
    expect(options(source('-input'))).toEqual(VECTOR_INPUTS.map(item => item.value))
    expect(options(calculation('-input'))).not.toContain('component')
    await user.selectOptions(source('-input'), 'view-ray')
    await user.selectOptions(screen.getByLabelText('Component'), 'z')
    expect(current()).toEqual({ type: 'component', axis: 'z', input: input('view-ray') })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')

    await user.selectOptions(calculation('-input'), 'constant')
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Z'), { target: { value: '4' } })
    expect(current()).toEqual({ type: 'component', axis: 'z', input: { type: 'constant', value: { x: 2, y: 3, z: 4 } } })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
  })

  it('supports all meaningful vector multiplication combinations while preserving matching children', async () => {
    const left = input('view-ray'), right = input('world-position')
    const initial: Expression = { type: 'component', axis: 'x', input: multiply(left, right) }
    const before = structuredClone(initial)
    const { user, current } = setup(initial)
    await user.click(summary(calculation('-input')))
    const combinations = screen.getByLabelText('Multiply values')
    expect(options(combinations)).toEqual(['vector-scalar', 'scalar-vector', 'vector-vector'])
    expect(combinations).toHaveValue('vector-vector')

    await user.selectOptions(combinations, 'vector-scalar')
    expect(current()).toEqual({ type: 'component', axis: 'x', input: multiply(left, constant(1)) })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    expect(screen.getByRole('button', { name: 'Use first value only' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Use second value only' })).not.toBeInTheDocument()

    await user.selectOptions(combinations, 'scalar-vector')
    const vectorOne: Expression = { type: 'constant', value: { x: 1, y: 1, z: 1 } }
    expect(current()).toEqual({ type: 'component', axis: 'x', input: multiply(constant(1), vectorOne) })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    expect(screen.queryByRole('button', { name: 'Use first value only' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use second value only' })).toBeVisible()

    await user.selectOptions(combinations, 'vector-vector')
    expect(current()).toEqual({ type: 'component', axis: 'x', input: multiply(vectorOne, vectorOne) })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    expect(initial).toEqual(before)
  })

  it('wraps a vector child without changing the component or discarding its source', async () => {
    const initial: Expression = { type: 'component', axis: 'y', input: input('group-position') }
    const { user, current } = setup(initial)
    await user.click(summary(calculation('-input')))
    await user.selectOptions(calculation('-input'), 'multiply')
    expect(current()).toEqual({ type: 'component', axis: 'y', input: multiply(initial.input, constant(1)) })
    expect(screen.getByLabelText('Multiply values')).toHaveValue('vector-scalar')
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    await user.click(screen.getByRole('button', { name: 'Use first value only' }))
    expect(current()).toEqual(initial)
  })

  it('blocks a ninth nested level, retains the current formula, and clears the notice after simplifying', async () => {
    expect(BUILDER_DRIVER_LIMITS.expressionDepth).toBe(8)
    const initial = waveChain(8)
    const before = structuredClone(initial)
    const { user, changed, current } = setup(initial)
    expect(expressionBudget(initial)).toEqual({ depth: 8, nodes: 8 })
    await user.selectOptions(calculation(), 'multiply')
    expect(screen.getByRole('status')).toHaveTextContent('nested up to 8 levels')
    expect(changed).not.toHaveBeenCalled()
    expect(current()).toEqual(before)
    expect(calculation()).toHaveValue('sin')

    const root = calculation().closest('details')!
    await user.click(within(root).getAllByRole('button', { name: 'Use incoming value only' })[0])
    expect(expressionBudget(current()).depth).toBe(7)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.selectOptions(calculation(), 'multiply')
    expect(expressionBudget(current())).toEqual({ depth: 8, nodes: 9 })
    expect(validateBuilderDriverExpression(current()).type).toBe('scalar')
    expect(initial).toEqual(before)
  })

  it('blocks more than 32 values and operations even when depth fits, without emitting an invalid update', async () => {
    expect(BUILDER_DRIVER_LIMITS.expressionNodes).toBe(32)
    const initial: Expression = { type: 'sin', input: additionTree(5) }
    const before = structuredClone(initial)
    const { user, changed, current } = setup(initial)
    expect(expressionBudget(initial)).toEqual({ depth: 6, nodes: 32 })
    expect(validateBuilderDriverExpression(initial).type).toBe('scalar')
    await user.selectOptions(calculation(), 'clamp')
    expect(screen.getByRole('status')).toHaveTextContent('limited to 32 values and operations')
    expect(changed).not.toHaveBeenCalled()
    expect(current()).toEqual(before)
    expect(calculation()).toHaveValue('sin')

    await user.selectOptions(calculation(), 'cos')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(current()).toEqual({ type: 'cos', input: initial.input })
    expect(expressionBudget(current())).toEqual({ depth: 6, nodes: 32 })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(initial).toEqual(before)
  })
})
