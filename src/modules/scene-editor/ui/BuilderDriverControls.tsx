import { useState } from 'react'
import { BUILDER_DRIVER_LIMITS, type BuilderDriver, type BuilderGroup, type BuilderObject } from '@modules/player'
import { AppIcon } from '@shared/ui'
import { createDriverPresetExpression, defaultDriverPreset, DRIVER_INFLUENCE_RANGE, DRIVER_PRESETS, DRIVER_SOURCES, driverTargets,
  moveBuilderDriver, readDriverPreset, updateBuilderDriver, type DriverPresetValues } from '../builderDrivers'
import { BuilderControlStage } from './BuilderInspector'
import { NumberField, SelectField, SliderField } from './SceneEditorControls'
import { FieldValidation } from './SceneEditorFieldValidation'

type Node = BuilderObject | BuilderGroup
type Props<T extends Node> = { node: T; onChange: (recipe: (current: T) => T) => void }

export function BuilderDriverControls<T extends Node>({ node, onChange }: Props<T>) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
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
        const values = preset?.preset === 'spin' && !driver.target.startsWith('rotation.') ? null : preset
        const title = values ? DRIVER_PRESETS.find(item => item.value === values.preset)!.label : 'Combined inputs'
        const fullMotion = values?.minimum === DRIVER_INFLUENCE_RANGE.minimum && values?.maximum === DRIVER_INFLUENCE_RANGE.maximum
        const target = targets.find(item => item.value === driver.target)
        const change = (next: Partial<BuilderDriver>) => onChange(current => updateBuilderDriver(current, index, next))
        const updatePreset = (next: Partial<DriverPresetValues>) => {
          if (values) change({ expression: createDriverPresetExpression({ ...values, ...next }) })
        }
        const move = (direction: -1 | 1) => {
          onChange(current => moveBuilderDriver(current, index, direction))
          setOpenIndex(index + direction)
        }
        return <BuilderControlStage key={index} index={index} title={title} description={target?.label ?? driver.target}
          fieldPrefix={`${prefix}-`} summary={[driver.mode === 'replace' ? 'Set' : driver.mode === 'multiply' ? 'Multiply' : 'Add']}
          open={openIndex === index} onToggle={() => setOpenIndex(current => current === index ? null : index)}
          toggleLabel={`${openIndex === index ? 'Collapse' : 'Expand'} ${title} influence ${index + 1}`}
          onRemove={() => onChange(current => ({ ...current, drivers: (current.drivers ?? []).filter((_entry, currentIndex) => currentIndex !== index) }))}
          removeLabel={`Remove influence ${index + 1}`}>
          <SelectField id={`${prefix}-target`} label="Property" value={driver.target} options={values?.preset === 'spin' ? targets.filter(item => item.value.startsWith('rotation.')) : targets}
            onChange={value => change({ target: value as BuilderDriver['target'] })} />
          <SelectField id={`${prefix}-mode`} label="Apply influence" value={driver.mode}
            options={[{ value: 'add', label: 'Add to the current value' }, { value: 'replace', label: 'Set the value' }, { value: 'multiply', label: 'Multiply the current value' }]}
            onChange={value => change({ mode: value as BuilderDriver['mode'] })} />
          {values ? <>
            {values.preset !== 'spin' ? <SelectField id={`${prefix}-source`} label="Input" value={values.source} options={DRIVER_SOURCES}
              onChange={source => updatePreset({ source })} description="Time, music and pointer affect the whole object. Position and view-ray inputs vary across its surface." /> : null}
            {values.preset !== 'follow' ? <SliderField id={`${prefix}-speed`} label="Speed" min={-10} max={10} step={.05}
              value={values.speed} onChange={speed => updatePreset({ speed })}
              description={values.preset === 'spin' ? 'Radians per second. Negative speed reverses direction.' : 'How quickly the pattern repeats as the input changes.'} /> : null}
            {values.preset !== 'spin' ? <SliderField id={`${prefix}-amount`} label="Amount" min={-10} max={10} step={.05} value={values.amount}
              onChange={amount => updatePreset({ amount })} description={values.preset === 'pulse' ? 'Pulse moves between zero and this amount.' : 'Negative values reverse the influence.'} /> : null}
            {values.preset !== 'follow' ? <SliderField id={`${prefix}-phase`} label="Phase" min={-Math.PI * 2} max={Math.PI * 2} step={.05}
              value={values.phase} onChange={phase => updatePreset({ phase })} description="Shift the starting point of the movement, in radians." /> : null}
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
          </> : <p className="field-hint">This imported influence combines supported inputs. It is preserved as authored; you can change its property, application and order, or remove it.</p>}
          {target ? <p className="field-hint">Final {target.label.toLowerCase()} stays between {Number(target.minimum.toFixed(2))} and {Number(target.maximum.toFixed(2))}{driver.target.startsWith('rotation.') ? ' radians; rotation wraps through full turns' : ''}.</p> : null}
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
    </div></FieldValidation>
    {'children' in node ? <p className="field-hint">Group movement is shared by every child. The closest parent defines group-position inputs.</p> : null}
  </>
}
