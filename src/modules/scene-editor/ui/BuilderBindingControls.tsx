import { useState } from 'react'
import { BUILDER_BINDING_LIMIT, BUILDER_BINDING_RULES, type BuilderBinding, type BuilderObject, type BuilderSceneDocument } from '@modules/player'
import { addBuilderBinding, availableBuilderBindingTargets, builderBindingResultRange, BUILDER_BINDING_SOURCE_LABELS,
  BUILDER_BINDING_TARGET_LABELS, formatBuilderBindingNumber, removeBuilderBinding, updateBuilderBinding } from '../builderBindings'
import { builderParent } from '../builderGroups'
import { BuilderControlStage, InspectorSection } from './BuilderInspector'
import { NumberField, SelectField, SliderField } from './SceneEditorControls'
import { FieldValidation } from './SceneEditorFieldValidation'

type Props = {
  object: BuilderObject
  document: BuilderSceneDocument
  onChange: (recipe: (object: BuilderObject) => BuilderObject) => void
}

function BindingResultRange({ object, binding }: { object: BuilderObject; binding: BuilderBinding }) {
  const range = builderBindingResultRange(object, binding)
  const format = (value: number) => `${formatBuilderBindingNumber(value)}${range.unit === '×' ? '×' : range.unit ? ` ${range.unit}` : ''}`
  return <p className="field-hint builder-binding-range">
    <strong>Result range: {format(range.minimum)} to {format(range.maximum)}.</strong>{' '}
    At rest: {format(range.resting)}.{range.limited ? ' Limited to the supported property range.' : ''}
  </p>
}

export function BuilderBindingControls({ object, document, onChange }: Props) {
  const [openTarget, setOpenTarget] = useState<BuilderBinding['target'] | null>(null)
  const available = availableBuilderBindingTargets(object)
  let parent = builderParent(document, object.id)
  let materialOwner: string | undefined
  while (parent) {
    if (parent.material) materialOwner = parent.name
    parent = builderParent(document, parent.id)
  }
  return <InspectorSection title="Music & pointer" description="Give this object its own responses" fieldPrefixes={['builder-binding']}
    status={object.bindings.length ? `${object.bindings.length} of ${BUILDER_BINDING_LIMIT} responses` : 'Off'}>
    <p className="field-hint">Add a track in Live Preview, or try Simulate beat in Motion. Pointer responses follow movement or touch on the preview. Each property can follow a different source.</p>
    <div className="builder-binding-stages">
      {object.bindings.map((binding, index) => {
        const prefix = `builder-binding-${index}`
        const title = BUILDER_BINDING_TARGET_LABELS[binding.target]
        const source = BUILDER_BINDING_SOURCE_LABELS[binding.source]
        const change = (changes: Partial<BuilderBinding>) => onChange(current => updateBuilderBinding(current, binding.target, changes))
        return <BuilderControlStage key={binding.target} index={index} title={title} description={source} fieldPrefix={`${prefix}-`}
          summary={[binding.mode === 'add' ? 'Add' : 'Set']} open={openTarget === binding.target}
          toggleLabel={`${openTarget === binding.target ? 'Collapse' : 'Expand'} ${title} response`}
          onToggle={() => setOpenTarget(current => current === binding.target ? null : binding.target)}
          removeLabel={`Remove ${title} response`} onRemove={() => onChange(current => removeBuilderBinding(current, binding.target))}>
          <SelectField id={`${prefix}-target`} label="Property" value={binding.target}
            options={Object.entries(BUILDER_BINDING_TARGET_LABELS).map(([value, label]) => ({ value, label,
              disabled: value !== binding.target && object.bindings.some(item => item.target === value) }))}
            onChange={value => {
              change({ target: value as BuilderBinding['target'] })
              setOpenTarget(value as BuilderBinding['target'])
            }} />
          <SelectField id={`${prefix}-source`} label="Source" value={binding.source}
            options={BUILDER_BINDING_RULES.source.enum.map(value => ({ value, label: BUILDER_BINDING_SOURCE_LABELS[value as BuilderBinding['source']] }))}
            onChange={value => change({ source: value as BuilderBinding['source'] })} />
          <SelectField id={`${prefix}-mode`} label="Apply response" value={binding.mode}
            options={[{ value: 'add', label: 'Add to the current value' }, { value: 'replace', label: 'Set the value' }]}
            onChange={value => change({ mode: value as BuilderBinding['mode'] })}
            description="Add keeps your authored setting as the starting point. Set uses only the response and offset." />
          <SliderField id={`${prefix}-amount`} label="Strength" description="Higher values give more movement. Negative values reverse it."
            min={BUILDER_BINDING_RULES.amount.minimum} max={BUILDER_BINDING_RULES.amount.maximum} step={.05} value={binding.amount}
            onChange={amount => change({ amount })} />
          <SliderField id={`${prefix}-offset`} label="Offset" description="Shifts the whole response, including its resting value."
            min={BUILDER_BINDING_RULES.offset.minimum} max={BUILDER_BINDING_RULES.offset.maximum} step={.05} value={binding.offset}
            onChange={offset => change({ offset })} />
          <BindingResultRange object={object} binding={binding} />
          <NumberField id={`${prefix}-attack`} label="Rise time (seconds)" description="How quickly the response follows a rising signal. Zero is immediate."
            min={BUILDER_BINDING_RULES.attack.minimum} max={BUILDER_BINDING_RULES.attack.maximum} step={.01} value={binding.attack}
            onChange={attack => change({ attack })} />
          <NumberField id={`${prefix}-release`} label="Fall time (seconds)" description="How gently the response settles as the signal falls."
            min={BUILDER_BINDING_RULES.release.minimum} max={BUILDER_BINDING_RULES.release.maximum} step={.01} value={binding.release}
            onChange={release => change({ release })} />
        </BuilderControlStage>
      })}
    </div>
    <FieldValidation id="builder-bindings">
      <button className="scene-secondary-button" type="button" disabled={object.bindings.length >= BUILDER_BINDING_LIMIT || !available.length}
        onClick={() => { setOpenTarget(available[0] ?? null); onChange(addBuilderBinding) }}>Add response</button>
    </FieldValidation>
    {object.bindings.length >= BUILDER_BINDING_LIMIT ? <p className="field-hint">This object has all {BUILDER_BINDING_LIMIT} responses. Remove one to use another property.</p> : null}
    {materialOwner && object.bindings.some(binding => binding.target.startsWith('material.'))
      ? <p className="field-hint">{materialOwner} supplies this object's visible material, so this object's metalness and shininess responses won't be visible.</p> : null}
    <p className="field-hint">These responses affect this object. The Motion section still controls scene-wide movement and music response.</p>
  </InspectorSection>
}
