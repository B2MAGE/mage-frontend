import { useState, type ReactNode } from 'react'
import { BUILDER_DRIVER_LIMITS, builderDriverResultRange, type BuilderDriver, type BuilderGroup, type BuilderObject } from '@modules/player'
import { AppIcon } from '@shared/ui'
import { createDriverPresetExpression, defaultDriverPreset, DRIVER_INFLUENCE_RANGE, DRIVER_PRESETS, DRIVER_SOURCES, driverTargets,
  isAudioPulse, moveBuilderDriver, readDriverPreset, updateBuilderDriver, type DriverPresetValues } from '../builderDrivers'
import { BuilderControlStage } from './BuilderInspector'
import { NumberField, SelectField, SliderField } from './SceneEditorControls'
import { FieldValidation } from './SceneEditorFieldValidation'
import { BuilderExpressionControls } from './BuilderExpressionControls'
import { useSceneEditorFieldIssue } from './sceneEditorFieldErrors'

type Node = BuilderObject | BuilderGroup
type Props<T extends Node> = { node: T; onChange: (recipe: (current: T) => T) => void }

function inputDescription(values: DriverPresetValues) {
  const { source, preset, audioDriven } = values
  if (source === 'time') return 'Elapsed scene time drives continuous movement while playback runs.'
  if (source === 'scene-size') return 'The shared size response from Motion, using the same music settings as templates.'
  if (source.startsWith('scene-pointer')) return 'The shared, smoothed pointer response used by templates. Move or press on the preview.'
  if (source.startsWith('pointer-')) {
    const range = source === 'pointer-x' ? 'Left is −1, center is 0, right is +1.'
      : source === 'pointer-y' ? 'Bottom is −1, center is 0, top is +1.' : 'Released is 0; pressed is 1.'
    const response = preset === 'pulse'
      ? source === 'pointer-down' ? 'At Phase 0, Pulse peaks when released. Use Follow input for a direct press response.'
        : 'At Phase 0, Pulse peaks at the center and decreases in both directions. Use Follow input for a directional response.'
      : preset === 'wobble' ? 'Movement samples a wave; it does not keep wobbling while the pointer is still.'
        : 'Positive Amount follows this direction; negative Amount reverses it.'
    return `${range} Move or touch the preview. ${response}`
  }
  const space = source.split('.')[0]
  const spaces: Record<string, string> = {
    'local-position': 'Surface coordinates relative to this object or group, before its animation influences. The pattern moves with it.',
    'group-position': 'Surface coordinates in the nearest parent group, before this node’s transform. Without a parent group, this matches World position.',
    'world-position': 'Surface coordinates in the scene. Moving the object through the scene changes which part of the pattern it samples.',
    'view-ray': 'Direction from the camera through each preview pixel, from −1 to +1. Change the camera angle to see it respond; pointer movement alone does not drive it.',
  }
  const spatial = spaces[space]
  if (spatial) return `${spatial} This shapes the surface rather than advancing with time.`
  if (audioDriven) return source.endsWith('-hit')
    ? 'Each detected hit drives the pulse, then it settles as the hit fades. The music controls the timing.'
    : 'Follows the selected music level continuously. Whole mix measures all sound; quieter bands produce smaller changes.'
  return 'The selected music value drives this influence. It changes with the music rather than elapsed time.'
}

export function BuilderDriverControls<T extends Node>({ node, onChange }: Props<T>) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [formulaIndices, setFormulaIndices] = useState<number[]>([])
  const targets = driverTargets(node)
  const drivers = node.drivers ?? []
  return <>
    <p className="field-hint">Layer movement and responses in the order shown. Each influence adds to, sets, or multiplies the current property value.{'children' in node ? '' : ' These run after Music & pointer responses.'}</p>
    <div className="builder-animation-stages">
      {drivers.map((driver, index) => {
        const prefix = `builder-driver-${index}`
        const preset = readDriverPreset(driver.expression)
        // The same linear expression is valid on other numeric properties, but
        // only rotation is a Spin control with wrapping and rotation targets.
        const values: DriverPresetValues | null = preset?.preset === 'spin' && !driver.target.startsWith('rotation.')
          ? { ...preset, preset: 'follow', amount: preset.speed, offset: preset.phase, ...DRIVER_INFLUENCE_RANGE, unclamped: true } : preset
        const showFormula = !values || formulaIndices.includes(index)
        const title = showFormula ? 'Combined inputs' : DRIVER_PRESETS.find(item => item.value === values!.preset)!.label
        const fullMotion = values?.minimum === DRIVER_INFLUENCE_RANGE.minimum && values?.maximum === DRIVER_INFLUENCE_RANGE.maximum
        const audioDriven = values?.audioDriven === true
        const timeDriven = values?.source === 'time' || values?.preset === 'spin'
        const target = targets.find(item => item.value === driver.target)
        const resultRange = builderDriverResultRange(node, driver)
        const change = (next: Partial<BuilderDriver>) => onChange(current => updateBuilderDriver(current, index, next))
        const updatePreset = (next: Partial<DriverPresetValues>) => {
          if (values) change({ expression: createDriverPresetExpression({ ...values, ...next }) })
        }
        const move = (direction: -1 | 1) => {
          onChange(current => moveBuilderDriver(current, index, direction))
          setOpenIndex(index + direction)
          setFormulaIndices(indices => indices.map(item => item === index ? index + direction : item === index + direction ? index : item))
        }
        return <BuilderControlStage key={index} index={index} title={title} description={target?.label ?? driver.target}
          fieldPrefix={`${prefix}-`} summary={[driver.mode === 'replace' ? 'Set' : driver.mode === 'multiply' ? 'Multiply' : 'Add']}
          open={openIndex === index} onToggle={() => setOpenIndex(current => current === index ? null : index)}
          toggleLabel={`${openIndex === index ? 'Collapse' : 'Expand'} ${title} influence ${index + 1}`}
          onRemove={() => {
            onChange(current => ({ ...current, drivers: (current.drivers ?? []).filter((_entry, currentIndex) => currentIndex !== index) }))
            setFormulaIndices(indices => indices.filter(item => item !== index).map(item => item > index ? item - 1 : item))
          }}
          removeLabel={`Remove influence ${index + 1}`}>
          <SelectField id={`${prefix}-target`} label="Property" value={driver.target} options={!showFormula && values?.preset === 'spin' ? targets.filter(item => item.value.startsWith('rotation.')) : targets}
            onChange={value => change({ target: value as BuilderDriver['target'] })} />
          <SelectField id={`${prefix}-mode`} label="Apply influence" value={driver.mode}
            options={[{ value: 'add', label: 'Add to the current value' }, { value: 'replace', label: 'Set the value' }, { value: 'multiply', label: 'Multiply the current value' }]}
            onChange={value => change({ mode: value as BuilderDriver['mode'] })} />
          <DriverExpressionValidation id={`${prefix}-expression`}>
          {values && !showFormula ? <>
            {values.preset !== 'spin' ? <SelectField id={`${prefix}-source`} label="Input" value={values.source} options={DRIVER_SOURCES}
              onChange={source => updatePreset({ source })} description={inputDescription(values)} /> : null}
            {isAudioPulse(values) && !audioDriven ? <div>
              <p className="field-hint">This pulse cycles through a wave as the audio value changes. Follow the audio signal directly to respond to its strength.</p>
              <button className="scene-secondary-button" type="button" onClick={() => updatePreset({})}>Follow audio signal</button>
            </div> : null}
            {values.preset !== 'follow' && !audioDriven ? <SliderField id={`${prefix}-speed`} label={timeDriven ? 'Speed' : 'Pattern frequency'} min={-10} max={10} step={.05}
              value={values.speed} onChange={speed => updatePreset({ speed })}
              description={values.preset === 'spin' ? 'Radians per second. Negative speed reverses direction.' : timeDriven
                ? 'How quickly the pattern repeats over time.' : 'How tightly the wave repeats across input values. This does not add motion over time.'} /> : null}
            {values.preset !== 'spin' ? <SliderField id={`${prefix}-amount`} label="Amount" min={-10} max={10} step={.05} value={values.amount}
              onChange={amount => updatePreset({ amount })} description={audioDriven ? 'Response strength. Increase this for quieter bands; negative amounts reverse the response.' : values.preset === 'pulse'
                ? 'Pulse ranges from zero to this amount, plus Offset. At input 0 and Phase 0, it starts at the full amount.' : 'Negative values reverse the influence.'} /> : null}
            {values.preset !== 'follow' && !audioDriven ? <SliderField id={`${prefix}-phase`} label="Phase" min={-Math.PI * 2} max={Math.PI * 2} step={.05}
              value={values.phase} onChange={phase => updatePreset({ phase })} description={timeDriven
                ? 'Shift the starting point of the movement, in radians.' : 'Shift the wave across the input range, in radians.'} /> : null}
            {values.preset !== 'spin' ? <SliderField id={`${prefix}-offset`} label="Offset" min={-10} max={10} step={.05} value={values.offset}
              onChange={offset => updatePreset({ offset })} description="Shift the whole influence up or down." /> : null}
            {values.preset === 'spin' ? <p className="field-hint">Rotation wraps naturally through full turns.</p> : <>
              <SelectField id={`${prefix}-limits`} label="Influence limits" value={fullMotion ? 'full' : 'custom'}
                options={[{ value: 'full', label: 'Full motion' }, { value: 'custom', label: 'Custom range' }]}
                onChange={value => updatePreset(value === 'full' ? DRIVER_INFLUENCE_RANGE : { minimum: -1, maximum: 1 })}
                description={fullMotion ? 'Amount and Offset use their full range. Final property limits still apply.' : 'Values outside this range are clipped. Narrow limits can flatten the motion; choose Full motion to remove them.'} />
              {!fullMotion ? <div className="scene-editor-grid scene-editor-grid--2">
              <NumberField id={`${prefix}-minimum`} label="Minimum influence" min={-1000} max={1000} value={values.minimum}
                onChange={minimum => updatePreset({ minimum })} />
              <NumberField id={`${prefix}-maximum`} label="Maximum influence" min={-1000} max={1000} value={values.maximum}
                onChange={maximum => updatePreset({ maximum })} />
              </div> : null}
            </>}
            {values.preset === 'spin' && !('children' in node) && node.operation.type === 'sphere' ? <p className="field-hint">A plain sphere has no obvious orientation, so it can look stationary while rotating. Try a less symmetrical shape to see the spin.</p> : null}
          </> : <BuilderExpressionControls id={`${prefix}-formula`} value={driver.expression} onChange={expression => {
            setFormulaIndices(indices => indices.includes(index) ? indices : [...indices, index])
            change({ expression })
          }} />}
          {values ? <button className="scene-secondary-button" type="button" onClick={() => setFormulaIndices(indices => showFormula
            ? indices.filter(item => item !== index) : [...indices, index])}>{showFormula ? 'Use simple controls' : 'Edit combined inputs'}</button> : null}
          </DriverExpressionValidation>
          {target ? <p className="field-hint">Final {target.label.toLowerCase()} stays between {Number(resultRange.minimum.toFixed(2))} and {Number(resultRange.maximum.toFixed(2))}{driver.target.startsWith('rotation.') ? ' radians; rotation wraps through full turns' : ''}.</p> : null}
          <div className="builder-group-selection">
            <button className="scene-secondary-button" type="button" disabled={index === 0} aria-label={`Move influence ${index + 1} earlier`} onClick={() => move(-1)}><AppIcon name="arrow-up" size={14} /> Earlier</button>
            <button className="scene-secondary-button" type="button" disabled={index === drivers.length - 1} aria-label={`Move influence ${index + 1} later`} onClick={() => move(1)}><AppIcon name="arrow-down" size={14} /> Later</button>
          </div>
        </BuilderControlStage>
      })}
    </div>
    <FieldValidation id="builder-drivers"><div className="builder-group-selection">
      {DRIVER_PRESETS.map(preset => <button key={preset.value} className="scene-secondary-button" type="button"
        disabled={drivers.length >= BUILDER_DRIVER_LIMITS.perNode} onClick={() => {
          setOpenIndex(drivers.length)
          onChange(current => ({ ...current, drivers: [...(current.drivers ?? []), defaultDriverPreset(current, preset.value).driver] }))
        }}>Add {preset.label.toLowerCase()}</button>)}
      <button className="scene-secondary-button" type="button" disabled={drivers.length >= BUILDER_DRIVER_LIMITS.perNode} onClick={() => {
        setOpenIndex(drivers.length)
        setFormulaIndices(indices => [...indices, drivers.length])
        onChange(current => ({ ...current, drivers: [...(current.drivers ?? []), {
          target: 'children' in current ? 'scale' : 'scale.x', mode: 'add', expression: {
            type: 'add', left: { type: 'input', source: 'bass-level' }, right: { type: 'constant', value: 0 },
          },
        }] }))
      }}>Add combined inputs</button>
    </div></FieldValidation>
    {'children' in node ? <p className="field-hint">Group movement is shared by every child. The closest parent defines group-position inputs.</p> : null}
  </>
}

function DriverExpressionValidation({ id, children }: { id: string; children: ReactNode }) {
  const { attributes } = useSceneEditorFieldIssue(id)
  return <FieldValidation id={id}><div className="builder-expression-fields" id={id} tabIndex={-1} {...attributes}>{children}</div></FieldValidation>
}
