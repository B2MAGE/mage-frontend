import { useState } from 'react'
import { BUILDER_DRIVER_LIMITS, BUILDER_LIMITS } from '@modules/player'
import { changeExpressionOperation, expressionBudget, expressionConstant, expressionSummary, expressionValueType,
  EXPRESSION_OPERATION_LABELS, SCALAR_INPUTS, VECTOR_INPUTS, type Expression } from '../builderExpressions'
import { NumberField, SelectField } from './SceneEditorControls'

const operations = Object.entries(EXPRESSION_OPERATION_LABELS).map(([value, label]) => ({ value, label }))
const bound = BUILDER_DRIVER_LIMITS.constantMagnitude
type Props = { id: string; value: Expression; onChange: (value: Expression) => void }

function ExpressionNode({ id, value, onChange, label, root = false }: Props & { label: string; root?: boolean }) {
  const valueType = expressionValueType(value)
  const child = (expression: Expression, slot: string, childLabel: string, update: (next: Expression) => Expression) =>
    <ExpressionNode id={`${id}-${slot}`} label={childLabel} value={expression} onChange={next => onChange(update(next))} />
  const number = (slot: string, numberLabel: string, current: number, update: (next: number) => Expression) =>
    <NumberField id={`${id}-${slot}`} label={numberLabel} value={current} min={-bound} max={bound} numericStep="any" onChange={next => onChange(update(next))} />
  return <details className="builder-expression-node" open={root || undefined}>
    <summary><strong>{label}</strong><span>{expressionSummary(value)}</span></summary>
    <div className="builder-expression-node__fields">
      <SelectField id={`${id}-operation`} label="Calculation" value={value.type}
        options={operations.filter(option => valueType === 'scalar' || !['component', 'noise'].includes(option.value))}
        onChange={next => onChange(changeExpressionOperation(value, next as Expression['type']))} />
      {value.type === 'constant' ? typeof value.value === 'number'
        ? number('value', 'Value', value.value, next => ({ ...value, value: next }))
        : <div className="builder-expression-vector">{(['x', 'y', 'z'] as const).map(axis => {
          const vector = value.value as { x: number; y: number; z: number }
          return <div key={axis}>{number(axis, axis.toUpperCase(), vector[axis], next => ({ ...value, value: { ...vector, [axis]: next } }))}</div>
        })}</div> : null}
      {value.type === 'input' ? <SelectField id={`${id}-source`} label="Input" value={value.source}
        options={valueType === 'vector' ? [...VECTOR_INPUTS] : SCALAR_INPUTS}
        onChange={source => onChange({ type: 'input', source: source as typeof value.source,
          ...(source === 'group-position' && value.ancestor ? { ancestor: value.ancestor } : {}) })}
        description={valueType === 'vector' ? 'Position and view-ray values vary across the surface. Scene pointer follows the smoothed preview pointer.'
          : 'Time advances during playback. Music follows the selected band; pointer inputs follow movement or touch on the preview.'} /> : null}
      {value.type === 'input' && value.source === 'group-position' ? <SelectField id={`${id}-ancestor`} label="Coordinate group" value={String(value.ancestor ?? 1)}
        options={Array.from({ length: BUILDER_LIMITS.groupDepth }, (_, index) => ({ value: String(index + 1), label: index === 0 ? 'Parent group' : `${index + 1} groups up` }))}
        onChange={ancestor => onChange({ ...value, ancestor: Number(ancestor) })}
        description="Coordinates are captured after that ancestor's transform. With fewer ancestors, World position is used." /> : null}
      {value.type === 'add' || value.type === 'multiply' ? <>
        {value.type === 'multiply' && valueType === 'vector' ? <SelectField id={`${id}-types`} label="Multiply values"
          value={`${expressionValueType(value.left)}-${expressionValueType(value.right)}`}
          options={[{ value: 'vector-scalar', label: 'XYZ × number' }, { value: 'scalar-vector', label: 'Number × XYZ' }, { value: 'vector-vector', label: 'XYZ × XYZ' }]}
          onChange={types => {
            const [left, right] = types.split('-') as ['scalar' | 'vector', 'scalar' | 'vector']
            onChange({ ...value, left: expressionValueType(value.left) === left ? value.left : expressionConstant(left, 1),
              right: expressionValueType(value.right) === right ? value.right : expressionConstant(right, 1) })
          }} /> : null}
        {child(value.left, 'left', 'First value', next => ({ ...value, left: next }))}
        {child(value.right, 'right', 'Second value', next => ({ ...value, right: next }))}
        <div className="builder-group-selection">
          {expressionValueType(value.left) === valueType ? <button type="button" className="scene-secondary-button" onClick={() => onChange(value.left)}>Use first value only</button> : null}
          {expressionValueType(value.right) === valueType ? <button type="button" className="scene-secondary-button" onClick={() => onChange(value.right)}>Use second value only</button> : null}
        </div>
      </> : null}
      {value.type === 'sin' || value.type === 'cos' || value.type === 'clamp' || value.type === 'component' || value.type === 'noise' ? <>
        {value.type === 'sin' || value.type === 'cos' ? <p className="field-hint">The wave returns −1 to +1. Multiply its input to change frequency, add to its input to shift phase, or multiply its result to change strength.</p> : null}
        {value.type === 'component' ? <SelectField id={`${id}-axis`} label="Component" value={value.axis}
          options={['x', 'y', 'z'].map(axis => ({ value: axis, label: axis.toUpperCase() }))}
          onChange={axis => onChange({ ...value, axis: axis as 'x' | 'y' | 'z' })} /> : null}
        {value.type === 'noise' ? <p className="field-hint">Noise samples an XYZ pattern. Multiply the coordinates for frequency, add an XYZ offset to move it, or add Time × XYZ to make it drift. Multiply the result for strength.</p> : null}
        {child(value.input, 'input', value.type === 'component' || value.type === 'noise' ? 'XYZ value' : 'Incoming value', next => ({ ...value, input: next }))}
        {value.type === 'clamp' ? <div className="scene-editor-grid scene-editor-grid--2">
          {number('min', 'Minimum', value.min, min => ({ ...value, min }))}
          {number('max', 'Maximum', value.max, max => ({ ...value, max }))}
        </div> : null}
        {value.type !== 'component' && value.type !== 'noise' ? <button type="button" className="scene-secondary-button" onClick={() => onChange(value.input)}>Use incoming value only</button> : null}
      </> : null}
    </div>
  </details>
}

export function BuilderExpressionControls({ id, value, onChange }: Props) {
  const [limitMessage, setLimitMessage] = useState<string | null>(null)
  return <div className="builder-expression-editor">
    <p className="field-hint">Open each value to edit it. Combine inputs with addition, multiplication and waves. Changes use the same preview and undo history as other controls.</p>
    <ExpressionNode id={id} value={value} label="Combined inputs" root onChange={next => {
      const budget = expressionBudget(next)
      if (budget.depth > BUILDER_DRIVER_LIMITS.expressionDepth || budget.nodes > BUILDER_DRIVER_LIMITS.expressionNodes) {
        setLimitMessage(`This calculation is limited to ${BUILDER_DRIVER_LIMITS.expressionNodes} values and operations, nested up to ${BUILDER_DRIVER_LIMITS.expressionDepth} levels. Simplify a value before adding more.`)
        return
      }
      setLimitMessage(null)
      onChange(next)
    }} />
    {limitMessage ? <p role="status" className="field-hint">{limitMessage}</p> : null}
  </div>
}
