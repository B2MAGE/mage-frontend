import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { BUILDER_OPERATIONS, BUILDER_LIMITS, BUILDER_TRANSFORMS, BUILDER_GROUP_TRANSFORMS, BUILDER_GROUP_BLEND, BUILDER_MATERIAL, BUILDER_MODIFIERS,
  BUILDER_ARRANGEMENTS, BUILDER_SPIN, BUILDER_RENDER_SETTINGS, builderOperationFields, createBuilderModifier, createBuilderArrangement,
  type BuilderArrangement, type BuilderDimension, type BuilderModifier, type BuilderObject, type BuilderSceneDocument, type BuilderGroup, type BuilderFrame, type BuilderRenderSettings } from '@modules/player'
import { AppIcon, EditorFieldShell } from '@shared/ui'
import {
  BUILDER_EXPANDED_PRIMITIVE_LIMIT,
  BUILDER_SHAPES,
  builderObjectExpandedCount,
  builderSceneExpandedCount,
  createBuilderOperation,
  type BuilderShape,
} from '../builderEditor'
import { NumberField, SelectField, SliderField, Vector3Field } from './SceneEditorControls'
import { FieldValidation } from './SceneEditorFieldValidation'
import { BuilderObjectList } from './BuilderObjectList'
import { BuilderControlStage, InspectorSection } from './BuilderInspector'
import { BuilderBindingControls } from './BuilderBindingControls'
import { BuilderDriverControls } from './BuilderDriverControls'
import { builderGroupFieldIssues, builderObjectFieldIssues, FieldErrorsContext, useSceneEditorFieldErrors, useSceneEditorFieldIssue } from './sceneEditorFieldErrors'
import { builderGroups, builderGroupingIssue, builderParent, findBuilderNode } from '../builderGroups'

type Props = {
  document: BuilderSceneDocument
  onAddObject: (shape: BuilderShape) => void
  onDuplicateObject: (objectId: string) => void
  onRemoveObject: (objectId: string) => void
  onMoveObject: (objectId: string, targetId: string) => void
  onSelectObject: (objectId: string) => void
  onUpdateObject: (objectId: string, recipe: (object: BuilderObject) => BuilderObject) => void
  onUpdateDocument: (recipe: (document: BuilderSceneDocument) => BuilderSceneDocument, changedField?: string) => void
  selectedObjectId: string | null
  onGroupNodes: (ids: string[]) => void
  onUngroupNode: (id: string) => void
  onReparentNode: (id: string, parentId: string | null) => void
  onUpdateGroup: (id: string, recipe: (group: BuilderGroup) => BuilderGroup) => void
  commandError: string | null
}

const axes = [{ label: 'X', value: 'x' }, { label: 'Y', value: 'y' }, { label: 'Z', value: 'z' }]

function BuilderInfoTooltip({ children, label }: { children: ReactNode; label: string }) {
  const id = useId()
  return <span className="builder-info-tooltip">
    <button aria-describedby={id} aria-label={label} className="builder-info-tooltip__trigger" type="button">
      <AppIcon name="info" size={13} strokeWidth={2.2} />
    </button>
    <span className="builder-info-tooltip__content" id={id} role="tooltip">{children}</span>
  </span>
}

function arrangementLimit(document: BuilderSceneDocument, object: BuilderObject, arrangementIndex: number) {
  const otherObjects = builderSceneExpandedCount(document) - builderObjectExpandedCount(object)
  const otherStages = object.arrangements.reduce((count, arrangement, index) =>
    index === arrangementIndex ? count : count * arrangement.count, 1)
  const type = object.arrangements[arrangementIndex]?.type ?? 'linear'
  return Math.min(BUILDER_ARRANGEMENTS[type].count.maximum, Math.floor((BUILDER_EXPANDED_PRIMITIVE_LIMIT - otherObjects) / otherStages))
}

function ArrangementStage({ arrangement, index, maxCount, object, onRemove, onToggle, open, update }: {
  arrangement: BuilderArrangement
  index: number
  maxCount: number
  object: BuilderObject
  onRemove: () => void
  onToggle: () => void
  open: boolean
  update: (object: BuilderObject) => void
}) {
  const definition = BUILDER_ARRANGEMENTS[arrangement.type]
  const title = definition.label
  const description = arrangement.type === 'linear'
    ? index === 0 ? 'Place copies along a line.' : 'Offset each copy in one direction after the previous stage.'
    : index === 0 ? 'Place copies around a circular path.' : 'Repeat the previous stage around a circular path.'
  const replace = (next: BuilderArrangement) => update({ ...object,
    arrangements: object.arrangements.map((item, itemIndex) => itemIndex === index ? next : item) })

  return <BuilderControlStage description={description} fieldPrefix={`builder-arrangement-${index}-`} index={index} onRemove={onRemove} onToggle={onToggle} open={open}
    removeLabel={`Remove ${title} arrangement ${index + 1}`}
    summary={[`Count: ${arrangement.count}`, arrangement.type === 'linear' ? `Spacing: ${arrangement.spacing}` : `Radius: ${arrangement.radius}`]}
    title={title} toggleLabel={`${open ? 'Collapse' : 'Expand'} ${title} arrangement ${index + 1}`}>
      <div className="scene-editor-grid scene-editor-grid--3">
        <NumberField id={`builder-arrangement-${index}-count`} label="Count" min={definition.count.minimum} max={maxCount} step={1} value={arrangement.count}
          onChange={count => replace({ ...arrangement, count })} />
        {arrangement.type === 'linear'
          ? <NumberField id={`builder-arrangement-${index}-spacing`} label="Spacing" min={BUILDER_ARRANGEMENTS.linear.spacing.minimum} max={BUILDER_ARRANGEMENTS.linear.spacing.maximum} step={0.1} value={arrangement.spacing}
            onChange={spacing => replace({ ...arrangement, spacing })} />
          : <NumberField id={`builder-arrangement-${index}-radius`} label="Radius" min={BUILDER_ARRANGEMENTS.radial.radius.minimum} max={BUILDER_ARRANGEMENTS.radial.radius.maximum} step={0.1} value={arrangement.radius}
            onChange={radius => replace({ ...arrangement, radius })} />}
        <SelectField id={`builder-arrangement-${index}-axis`} label="Axis" value={arrangement.axis} options={axes}
          onChange={axis => replace({ ...arrangement, axis: axis as 'x' | 'y' | 'z' })} />
      </div>
  </BuilderControlStage>
}

function ModifierControls({ object, update }: { object: BuilderObject; update: (object: BuilderObject) => void }) {
  const [newType, setNewType] = useState<BuilderModifier['type']>('expand')
  const [openType, setOpenType] = useState<BuilderModifier['type'] | null>(null)
  const exists = object.modifiers.some(modifier => modifier.type === newType)
  const add = () => {
    setOpenType(newType)
    update({ ...object, modifiers: [...object.modifiers, createBuilderModifier(newType)] })
  }
  return <div className="builder-composition-control">
    <div className="builder-composition-control__add">
      <select aria-label="Modifier" className="mage-select" value={newType}
        onChange={event => setNewType(event.currentTarget.value as BuilderModifier['type'])}>
        {Object.entries(BUILDER_MODIFIERS).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}
      </select>
      <button className="scene-secondary-button" type="button" disabled={object.modifiers.length >= BUILDER_LIMITS.modifiers || exists} onClick={add}>Add modifier</button>
    </div>
    {object.modifiers.length === 0 ? <p className="field-hint">No modifiers. Add Expand, Shell, or Twist to reshape every arranged copy.</p> : null}
    {object.modifiers.length ? <div className="builder-modifier-stages">
      {object.modifiers.map((modifier, index) => {
        const title = BUILDER_MODIFIERS[modifier.type].label
        const open = openType === modifier.type
        const summary = modifier.type === 'expand' ? [`Amount: ${modifier.amount}`]
          : modifier.type === 'shell' ? [`Thickness: ${modifier.thickness}`]
            : [`Axis: ${modifier.axis.toUpperCase()}`, `Amount: ${modifier.amount}`]
        const description = modifier.type === 'expand' ? 'Move the surface outward or inward.'
          : modifier.type === 'shell' ? 'Turn the surface into a hollow shell.' : 'Rotate the shape progressively along an axis.'
        return <BuilderControlStage description={description} fieldPrefix={`builder-modifier-${index}-`} index={index} key={modifier.type}
          onRemove={() => {
            if (open) setOpenType(null)
            update({ ...object, modifiers: object.modifiers.filter((_, itemIndex) => itemIndex !== index) })
          }}
          onToggle={() => setOpenType(current => current === modifier.type ? null : modifier.type)} open={open}
          removeLabel={`Remove ${title} modifier ${index + 1}`} summary={summary} title={title}
          titleAddon={modifier.type === 'twist' && object.operation.type === 'sphere'
            ? <BuilderInfoTooltip label="Why Twist may not be visible on a sphere">
              A sphere is symmetrical, so twisting it can look unchanged. Try a less symmetrical shape to make the effect easier to see.
            </BuilderInfoTooltip>
            : null}
          toggleLabel={`${open ? 'Collapse' : 'Expand'} ${title} modifier ${index + 1}`}>
          {modifier.type === 'expand'
            ? <NumberField id={`builder-modifier-${index}-amount`} label="Amount" min={BUILDER_MODIFIERS.expand.amount.minimum} max={BUILDER_MODIFIERS.expand.amount.maximum} step={0.01} value={modifier.amount}
              onChange={amount => update({ ...object, modifiers: object.modifiers.map((item, itemIndex) => itemIndex === index ? { ...modifier, amount } : item) })} />
            : modifier.type === 'shell'
              ? <NumberField id={`builder-modifier-${index}-thickness`} label="Thickness" min={BUILDER_MODIFIERS.shell.thickness.minimum} max={BUILDER_MODIFIERS.shell.thickness.maximum} step={0.01} value={modifier.thickness}
                onChange={thickness => update({ ...object, modifiers: object.modifiers.map((item, itemIndex) => itemIndex === index ? { ...modifier, thickness } : item) })} />
              : <div className="scene-editor-grid">
                <SelectField id={`builder-modifier-${index}-axis`} label="Axis" value={modifier.axis} options={axes}
                  onChange={axis => update({ ...object, modifiers: object.modifiers.map((item, itemIndex) => itemIndex === index ? { ...modifier, axis: axis as 'x' | 'y' | 'z' } : item) })} />
                <NumberField id={`builder-modifier-${index}-amount`} label="Twist" min={BUILDER_MODIFIERS.twist.amount.minimum} max={BUILDER_MODIFIERS.twist.amount.maximum} step={0.05} value={modifier.amount}
                  onChange={amount => update({ ...object, modifiers: object.modifiers.map((item, itemIndex) => itemIndex === index ? { ...modifier, amount } : item) })} />
              </div>}
        </BuilderControlStage>
      })}
    </div> : null}
  </div>
}

function ArrangementControls({ document, object, update }: { document: BuilderSceneDocument; object: BuilderObject; update: (object: BuilderObject) => void }) {
  const [newType, setNewType] = useState<BuilderArrangement['type']>('linear')
  const [openType, setOpenType] = useState<BuilderArrangement['type'] | null>(object.arrangements[0]?.type ?? null)
  const exists = object.arrangements.some(arrangement => arrangement.type === newType)
  const minimum = BUILDER_ARRANGEMENTS[newType].count.minimum
  const addedIndex = object.arrangements.length
  const availableCount = arrangementLimit(document, object, addedIndex)
  const canAdd = object.arrangements.length < BUILDER_LIMITS.arrangements && !exists && availableCount >= minimum
  const add = () => {
    setOpenType(newType)
    const next = createBuilderArrangement(newType)
    update({ ...object, arrangements: [...object.arrangements, { ...next, count: Math.min(next.count, availableCount) }] })
  }
  return <div className="builder-composition-control">
    <div className="builder-composition-control__add">
      <select aria-label="Arrangement" className="mage-select" value={newType}
        onChange={event => setNewType(event.currentTarget.value as BuilderArrangement['type'])}>
        {Object.entries(BUILDER_ARRANGEMENTS).map(([value, definition]) => <option key={value} value={value}>{definition.label}</option>)}
      </select>
      <button className="scene-secondary-button" type="button" disabled={!canAdd} onClick={add}>Add arrangement</button>
    </div>
    {object.arrangements.length === 0 ? <p className="field-hint">No arrangement. This object renders once.</p> : null}
    {object.arrangements.length ? <div className="builder-arrangement-stages">
      {object.arrangements.map((arrangement, index) => <ArrangementStage arrangement={arrangement} index={index}
        key={arrangement.type} maxCount={arrangementLimit(document, object, index)} object={object}
        onRemove={() => {
          if (openType === arrangement.type) setOpenType(null)
          update({ ...object, arrangements: object.arrangements.filter((_, itemIndex) => itemIndex !== index) })
        }}
        onToggle={() => setOpenType(current => current === arrangement.type ? null : arrangement.type)}
        open={openType === arrangement.type} update={update} />)}
    </div> : null}
    <p className="field-hint">{builderSceneExpandedCount(document)} of {BUILDER_EXPANDED_PRIMITIVE_LIMIT} rendered copies used. Two arrangement stages may be nested.</p>
  </div>
}

function SizeControls({ object, update }: { object: BuilderObject; update: (operation: BuilderObject['operation']) => void }) {
  const [openControl, setOpenControl] = useState<BuilderDimension | null>(null)
  const operation = object.operation
  const controls = builderOperationFields(operation)

  const change = (control: { key: BuilderDimension }, value: number) => {
    update({ ...operation, [control.key]: value } as BuilderObject['operation'])
  }

  return <div className="builder-size-stages">
    {controls.map(control => {
      const open = openControl === control.key
      return <BuilderControlStage description={control.description} fieldPrefix={`builder-${control.key}`} key={control.key}
        onToggle={() => setOpenControl(current => current === control.key ? null : control.key)} open={open}
        summary={[conciseNumber(control.value)]} title={control.title}
        toggleLabel={`${open ? 'Collapse' : 'Expand'} ${control.title} size`}>
        <NumberField id={`builder-${control.key}`} label={control.title} min={control.minimum} max={control.maximum} step={control.minimum < .001 ? .0001 : .01} value={control.value}
          onChange={value => change(control, value)} />
      </BuilderControlStage>
    })}
  </div>
}

function BuilderObjectActions({ canDuplicate, onDuplicate, onRemove, onUngroup }: { canDuplicate: boolean; onDuplicate: () => void; onRemove: () => void; onUngroup?: () => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function run(action: () => void) {
    setOpen(false)
    action()
    trigger.current?.focus()
  }

  return <div className="builder-object-actions" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button className="scene-secondary-button builder-object-actions__trigger" type="button" ref={trigger}
      aria-label="Object options" title="Object options" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}>
      <AppIcon name="settings" size={18} />
    </button>
    {open ? <div className="builder-object-actions__menu" id={id} role="menu" aria-label="Object options">
      <button type="button" role="menuitem" disabled={!canDuplicate} onClick={() => run(onDuplicate)}>Duplicate</button>
      {onUngroup ? <button type="button" role="menuitem" onClick={() => run(onUngroup)}>Ungroup</button> : null}
      <button className="builder-object-actions__remove" type="button" role="menuitem" onClick={() => run(onRemove)}>Remove</button>
    </div> : null}
  </div>
}

const shapeLabel = (object: BuilderObject) => BUILDER_OPERATIONS[object.operation.type].label

function sizeSummary(object: BuilderObject) {
  const operation = object.operation
  if (operation.type === 'box' || operation.type === 'box-frame') {
    const dimensions = [operation.width, operation.height, operation.depth].map(conciseNumber).join(' × ')
    return operation.type === 'box-frame' ? `${dimensions} · Edge ${conciseNumber(operation.thickness)}` : dimensions
  }
  if (operation.type === 'lattice') return `${conciseNumber(operation.iterations)} repetitions · Spacing ${conciseNumber(operation.spacing)} · Rod ${conciseNumber(operation.thickness)}`
  if (operation.type === 'torus') return `Radius ${conciseNumber(operation.radius)} · Tube ${conciseNumber(operation.tube)}`
  if (operation.type === 'cylinder') return `Radius ${conciseNumber(operation.radius)} · Height ${conciseNumber(operation.height)}`
  return `Radius ${conciseNumber(operation.radius)}`
}

function conciseNumber(value: number) {
  return Number(value !== 0 && Math.abs(value) < .01 ? value.toPrecision(3) : value.toFixed(2)).toString()
}

function conciseVector(vector: { x: number; y: number; z: number }) {
  return `${conciseNumber(vector.x)}, ${conciseNumber(vector.y)}, ${conciseNumber(vector.z)}`
}

function vectorSummary(object: { transform: BuilderObject['transform'] | BuilderFrame }) {
  const { position, rotation, scale } = object.transform
  const parts = [`Position ${conciseVector(position)}`]
  if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) parts.push(`Rotation ${conciseVector(rotation)}`)
  parts.push(typeof scale === 'number' ? `Scale ${conciseNumber(scale)}×` : scale.x === scale.y && scale.y === scale.z
    ? `Scale ${conciseNumber(scale.x)}×`
    : `Scale ${conciseNumber(scale.x)} × ${conciseNumber(scale.y)} × ${conciseNumber(scale.z)}`)
  return parts.join(' · ')
}

function TransformControls<T extends BuilderObject['transform'] | BuilderFrame>({ transform, update, idPrefix = 'builder', labelPrefix = '' }: {
  transform: T; update: (transform: T) => void; idPrefix?: string; labelPrefix?: string
}) {
  const [openStage, setOpenStage] = useState<'position' | 'rotation' | 'scale' | null>(null)
  const toggle = (stage: 'position' | 'rotation' | 'scale') => setOpenStage(current => current === stage ? null : stage)
  return <div className="builder-transform-stages">
    <BuilderControlStage description="Move through the scene." fieldPrefix={`${idPrefix}-position-`} onToggle={() => toggle('position')}
      open={openStage === 'position'} summary={[conciseVector(transform.position)]} title="Position"
      toggleLabel={`${openStage === 'position' ? 'Collapse' : 'Expand'} ${labelPrefix}Position transform`}>
      <Vector3Field id={`${idPrefix}-position`} label={`${labelPrefix}Position`} min={BUILDER_TRANSFORMS.position.properties.x.minimum} max={BUILDER_TRANSFORMS.position.properties.x.maximum} value={transform.position}
        onChange={position => update({ ...transform, position })} />
    </BuilderControlStage>
    <BuilderControlStage description="Turn the object around each axis." fieldPrefix={`${idPrefix}-rotation-`} onToggle={() => toggle('rotation')}
      open={openStage === 'rotation'} summary={[conciseVector(transform.rotation)]} title="Rotation"
      toggleLabel={`${openStage === 'rotation' ? 'Collapse' : 'Expand'} ${labelPrefix}Rotation transform`}>
      <Vector3Field id={`${idPrefix}-rotation`} label={`${labelPrefix}Rotation`} min={BUILDER_TRANSFORMS.rotation.properties.x.minimum} max={BUILDER_TRANSFORMS.rotation.properties.x.maximum} step={0.01} value={transform.rotation}
        onChange={rotation => update({ ...transform, rotation })} />
      {typeof transform.scale === 'number' ? <>
        <SelectField id={`${idPrefix}-rotation-order`} label="Rotation order" value={(transform as BuilderFrame).rotationOrder ?? 'xyz'}
          options={BUILDER_GROUP_TRANSFORMS.rotationOrder.enum.map(value => ({ value, label: value.toUpperCase().split('').join(' → ') }))}
          onChange={rotationOrder => update({ ...transform, rotationOrder: rotationOrder as BuilderFrame['rotationOrder'] })} />
        <p className="field-hint">Changing the order changes the result when more than one axis turns.</p>
      </> : null}
    </BuilderControlStage>
    <BuilderControlStage description={typeof transform.scale === 'number' ? 'Resize together, keeping proportions.' : 'Resize the object along each axis.'} fieldPrefix={`${idPrefix}-scale`} onToggle={() => toggle('scale')}
      open={openStage === 'scale'} summary={[typeof transform.scale === 'number' ? `${conciseNumber(transform.scale)}×` : conciseVector(transform.scale)]} title="Scale"
      toggleLabel={`${openStage === 'scale' ? 'Collapse' : 'Expand'} ${labelPrefix}Scale transform`}>
      {typeof transform.scale === 'number' ? <SliderField id={`${idPrefix}-scale`} label={`${labelPrefix}Scale`} min={BUILDER_GROUP_TRANSFORMS.scale.minimum} max={BUILDER_GROUP_TRANSFORMS.scale.maximum} step={.01} value={transform.scale}
        onChange={scale => update({ ...transform, scale })} /> : <Vector3Field id={`${idPrefix}-scale`} label={`${labelPrefix}Scale`} min={BUILDER_TRANSFORMS.scale.properties.x.minimum} max={BUILDER_TRANSFORMS.scale.properties.x.maximum} value={transform.scale}
        onChange={scale => update({ ...transform, scale })} />}
    </BuilderControlStage>
  </div>
}

function BuilderColorControl({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const [draft, setDraft] = useState(value.toUpperCase())
  const issue = useSceneEditorFieldIssue('builder-color')
  const updateDraft = (nextValue: string) => {
    const nextDraft = nextValue.toUpperCase()
    setDraft(nextDraft)
    if (/^#?[0-9A-F]{6}$/.test(nextDraft)) onChange((nextDraft.startsWith('#') ? nextDraft : `#${nextDraft}`).toLowerCase())
  }
  const restoreDraft = () => {
    if (!/^#?[0-9A-F]{6}$/.test(draft)) setDraft(value.toUpperCase())
  }

  return <div className="builder-color-control">
    <input {...issue.attributes} className="scene-color-input builder-color-control__swatch" id="builder-color"
      type="color" value={value} onChange={event => onChange(event.currentTarget.value)} />
    <input aria-label="Color code" className="builder-color-control__value" inputMode="text" maxLength={7}
      pattern="#?[0-9A-Fa-f]{6}" spellCheck={false} type="text" value={draft}
      onBlur={restoreDraft}
      onChange={event => updateDraft(event.currentTarget.value)}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value.toUpperCase())
          event.currentTarget.blur()
        }
      }} />
  </div>
}

function AnimationControls({ object, update }: { object: BuilderObject; update: (object: BuilderObject) => void }) {
  const [open, setOpen] = useState(false)
  const spinMotion = object.motion.type === 'spin' ? object.motion : null
  return <div className="builder-animation-stages">
    <BuilderControlStage description="Rotate the object continuously around one axis." fieldPrefix="builder-motion-" onToggle={() => setOpen(value => !value)} open={open}
      summary={spinMotion ? [`Axis: ${spinMotion.axis.toUpperCase()}`, `Speed: ${conciseNumber(spinMotion.speed)}`] : ['Off']}
      title="Spin"
      titleAddon={object.operation.type === 'sphere'
        ? <BuilderInfoTooltip label="Why Spin may be hard to see on a sphere">
          A plain sphere has no obvious orientation, so it can look stationary while rotating. A less symmetrical shape makes the rotation clearer.
        </BuilderInfoTooltip>
        : null}
      toggleLabel={`${open ? 'Collapse' : 'Expand'} Spin animation`}>
      <SelectField id="builder-motion-axis" label="Axis" value={spinMotion?.axis ?? 'none'}
        options={[{ label: 'None', value: 'none' }, ...axes]}
        onChange={axis => update({ ...object, motion: axis === 'none' ? { type: 'none' }
          : { type: 'spin', axis: axis as 'x' | 'y' | 'z', speed: spinMotion?.speed ?? BUILDER_SPIN.speed.default } })} />
      {spinMotion ? <SliderField id="builder-motion-speed" label="Speed" min={BUILDER_SPIN.speed.minimum} max={BUILDER_SPIN.speed.maximum} step={0.05}
        value={spinMotion.speed} onChange={speed => update({ ...object, motion: { ...spinMotion, speed } })} /> : null}
    </BuilderControlStage>
  </div>
}

function AppearanceControls<T extends Pick<BuilderObject, 'id' | 'material'>>({ object, update }: { object: T; update: (object: T) => void }) {
  const [openControl, setOpenControl] = useState<'color' | 'metalness' | 'shininess' | null>(null)
  const toggle = (control: 'color' | 'metalness' | 'shininess') => setOpenControl(current => current === control ? null : control)
  return <div className="builder-appearance-stages">
    <BuilderControlStage description="Choose the object's base color." fieldPrefix="builder-color" onToggle={() => toggle('color')}
      open={openControl === 'color'} summary={[object.material.color.toUpperCase()]} title="Color"
      toggleLabel={`${openControl === 'color' ? 'Collapse' : 'Expand'} Color appearance`}>
      <FieldValidation id="builder-color">
        <EditorFieldShell fieldClassName="builder-color-field" htmlFor="builder-color" label="Color">
          <BuilderColorControl key={`${object.id}-${object.material.color}`} value={object.material.color}
            onChange={color => update({ ...object, material: { ...object.material, color } })} />
        </EditorFieldShell>
      </FieldValidation>
    </BuilderControlStage>
    <BuilderControlStage description="Control how strongly the surface reflects its environment." fieldPrefix="builder-metalness" onToggle={() => toggle('metalness')}
      open={openControl === 'metalness'} summary={[conciseNumber(object.material.metalness)]} title="Metalness"
      toggleLabel={`${openControl === 'metalness' ? 'Collapse' : 'Expand'} Metalness appearance`}>
      <SliderField id="builder-metalness" label="Metalness" min={BUILDER_MATERIAL.metalness.minimum} max={BUILDER_MATERIAL.metalness.maximum} step={0.01} value={object.material.metalness}
        onChange={metalness => update({ ...object, material: { ...object.material, metalness } })} />
    </BuilderControlStage>
    <BuilderControlStage description="Control the brightness and focus of highlights." fieldPrefix="builder-shininess" onToggle={() => toggle('shininess')}
      open={openControl === 'shininess'} summary={[conciseNumber(object.material.shininess)]} title="Shininess"
      toggleLabel={`${openControl === 'shininess' ? 'Collapse' : 'Expand'} Shininess appearance`}>
      <SliderField id="builder-shininess" label="Shininess" min={BUILDER_MATERIAL.shininess.minimum} max={BUILDER_MATERIAL.shininess.maximum} step={0.01} value={object.material.shininess}
        onChange={shininess => update({ ...object, material: { ...object.material, shininess } })} />
    </BuilderControlStage>
  </div>
}

function BuilderParentControl({ document, id, onMove }: { document: BuilderSceneDocument; id: string; onMove: Props['onReparentNode'] }) {
  const groups = builderGroups(document)
  const isDescendant = (candidateId: string): boolean => {
    if (candidateId === id) return true
    const parent = builderParent(document, candidateId)
    return parent ? isDescendant(parent.id) : false
  }
  if (!groups.length) return null
  return <div className="builder-parent-control">
    <SelectField id="builder-parent" label="Move to group" value={builderParent(document, id)?.id ?? ''}
      options={[{ label: 'Scene level', value: '' }, ...groups.filter(group => !isDescendant(group.id)).map(group => ({ label: group.name, value: group.id }))]}
      onChange={value => onMove(id, value || null)} />
    <p className="field-hint">Keeps its authored placement. The destination group's movement, join, and material apply.</p>
  </div>
}

function BuilderGroupInspector({ document, group, issues, onDuplicate, onRemove, onUngroup, onMove, onUpdate }: {
  document: BuilderSceneDocument; group: BuilderGroup; issues: ReturnType<typeof builderGroupFieldIssues>
  onDuplicate: Props['onDuplicateObject']; onRemove: Props['onRemoveObject']; onUngroup: Props['onUngroupNode']
  onMove: Props['onReparentNode']; onUpdate: Props['onUpdateGroup']
}) {
  const update = (recipe: (group: BuilderGroup) => BuilderGroup) => onUpdate(group.id, recipe)
  const material = group.material
  return <FieldErrorsContext.Provider value={issues}>
    <section className="builder-object-editor builder-object-inspector" aria-labelledby="builder-group-editor-title">
      <header className="builder-object-editor__heading">
        <div><h3 className="builder-object-editor__title" id="builder-group-editor-title">Selected group</h3><p>{group.name} · {group.children.length} items</p></div>
        <BuilderObjectActions canDuplicate={document.objects.length < BUILDER_LIMITS.objects && builderGroups(document).length < BUILDER_LIMITS.groups}
          onDuplicate={() => onDuplicate(group.id)} onRemove={() => onRemove(group.id)} onUngroup={() => onUngroup(group.id)} />
      </header>
      <div className="builder-object-inspector__body">
        <FieldValidation id="builder-object-name"><EditorFieldShell htmlFor="builder-object-name" label="Name">
          <input className="scene-text-input" id="builder-object-name" maxLength={BUILDER_LIMITS.nameLength} value={group.name}
            aria-invalid={Boolean(issues['builder-object-name'])} aria-describedby={issues['builder-object-name'] ? 'builder-object-name-error' : undefined}
            onChange={event => update(current => ({ ...current, name: event.currentTarget.value }))} />
        </EditorFieldShell></FieldValidation>
        <BuilderParentControl document={document} id={group.id} onMove={onMove} />
        <InspectorSection title="Transform" fieldPrefixes={['builder-position-', 'builder-rotation-', 'builder-scale']} description="Move, rotate, and resize all children" status={vectorSummary(group)}>
          <TransformControls key={group.id} transform={group.transform} update={transform => update(current => ({ ...current, transform }))} />
        </InspectorSection>
        <InspectorSection title="Animation" fieldPrefixes={['builder-driver-', 'builder-drivers']} description="Shared movement and responses" status={group.drivers?.length ? `${group.drivers.length} influences` : 'Off'}>
          <BuilderDriverControls key={group.id} node={group} onChange={update} />
        </InspectorSection>
        <InspectorSection title="Composition" fieldPrefixes={['builder-group-operation', 'builder-group-blend']} description="How the children's surfaces join"
          status={group.operation.type === 'union' ? 'Union' : `Smooth union · ${conciseNumber(group.operation.blend)}`}>
          <SelectField id="builder-group-operation" label="Join surfaces" value={group.operation.type}
            options={[{ label: 'Union', value: 'union' }, { label: 'Smooth union', value: 'smooth-union' }]}
            onChange={value => update(current => ({ ...current, operation: value === 'union' ? { type: 'union' } : { type: 'smooth-union', blend: .25 } }))} />
          <p className="field-hint">Union keeps distinct edges. Smooth union blends nearby surfaces in the order shown.</p>
          {group.operation.type === 'smooth-union' ? <SliderField id="builder-group-blend" label="Blend radius" min={BUILDER_GROUP_BLEND.minimum} max={BUILDER_GROUP_BLEND.maximum} step={.01}
            value={group.operation.blend} onChange={blend => update(current => ({ ...current, operation: { type: 'smooth-union', blend } }))} /> : null}
        </InspectorSection>
        <InspectorSection title="Appearance" fieldPrefixes={['builder-color', 'builder-metalness', 'builder-shininess']} description="Use child materials or one group material" status={material ? material.color.toUpperCase() : 'Child materials'}>
          <label className="builder-group-material-toggle"><input type="checkbox" checked={Boolean(material)}
            onChange={event => update(current => {
              if (event.currentTarget.checked) return { ...current, material: { color: BUILDER_MATERIAL.color.default, metalness: BUILDER_MATERIAL.metalness.default, shininess: BUILDER_MATERIAL.shininess.default } }
              const next = { ...current }; delete next.material; return next
            })} /> Use one material for this group</label>
          <p className="field-hint">An outer group's material overrides its children. Turn it off to restore their own materials.</p>
          {material ? <AppearanceControls key={group.id} object={{ id: group.id, material }} update={value => update(current => ({ ...current, material: value.material }))} /> : null}
        </InspectorSection>
        <p className="field-hint">Ungroup keeps authored placement and colors. This group's animation and smooth join are removed; the parent behavior applies.</p>
      </div>
    </section>
  </FieldErrorsContext.Provider>
}

export function BuilderSceneControls({
  document,
  onAddObject,
  onDuplicateObject,
  onRemoveObject,
  onMoveObject,
  onSelectObject,
  onUpdateObject,
  onUpdateDocument,
  selectedObjectId,
  onGroupNodes, onUngroupNode, onReparentNode, onUpdateGroup, commandError,
}: Props) {
  const [newShape, setNewShape] = useState<BuilderShape>('sphere')
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const checked = checkedIds.filter(id => findBuilderNode(document, id))
  const groupingIssue = builderGroupingIssue(document, checked)
  const selected = document.objects.find(object => object.id === selectedObjectId) ?? null
  const selectedGroup = builderGroups(document).find(group => group.id === selectedObjectId) ?? null
  const selectedIndex = document.objects.findIndex(object => object.id === selectedObjectId)
  const update = (recipe: (object: BuilderObject) => BuilderObject) => {
    if (selected) onUpdateObject(selected.id, recipe)
  }
  const allIssues = useSceneEditorFieldErrors()
  const selectedIssues = builderObjectFieldIssues(allIssues, selectedIndex)
  selected?.arrangements.forEach((arrangement, index) => {
    const maximum = arrangementLimit(document, selected, index)
    if (arrangement.count > maximum) selectedIssues[`builder-arrangement-${index}-count`] ??= {
      path: `objects[${selectedIndex}].arrangements[${index}].count`,
      message: `Use ${Math.max(0, maximum)} copies or fewer to stay within ${BUILDER_EXPANDED_PRIMITIVE_LIMIT} rendered copies.`,
    }
  })
  const nameIssue = selectedIssues['builder-object-name']
  const rendering = document.rendering ?? {
    maxIterations: BUILDER_RENDER_SETTINGS.maxIterations.default,
    stepSize: BUILDER_RENDER_SETTINGS.stepSize.default,
  }
  const updateRendering = (field: keyof BuilderRenderSettings, value: number) => onUpdateDocument(current => ({
    ...current, rendering: { ...rendering, ...current.rendering, [field]: value },
  }), `rendering.${field}`)

  return <section className="builder-workspace" aria-labelledby="builder-workspace-title">
    <header className="builder-workspace__header">
      <div className="builder-workspace__title">
        <h3 id="builder-workspace-title">Builder workspace</h3>
        <span>{document.objects.length} of {BUILDER_LIMITS.objects} objects</span>
      </div>
      <p className="field-hint">Select an object or group to edit it.</p>
    </header>

    <div className="builder-layout">
      <aside className="builder-object-section builder-object-rail" aria-labelledby="builder-objects-title">
        <div className="builder-object-rail__header">
          <h3 className="builder-object-section__title" id="builder-objects-title">Objects</h3>
          <div className="builder-group-selection">
            <button className="scene-secondary-button" type="button" disabled={Boolean(groupingIssue)} title={groupingIssue ?? 'Group selected items'}
              onClick={() => { onGroupNodes(checked); setCheckedIds([]) }}><AppIcon name="layers" size={14} /> Group selected{checked.length ? ` (${checked.length})` : ''}</button>
            {checked.length ? <button className="scene-secondary-button" type="button" onClick={() => setCheckedIds([])}>Clear</button> : null}
          </div>
          {checked.length > 1 && groupingIssue ? <p className="field-hint">{groupingIssue}</p> : null}
        </div>

        {commandError ? <p className="builder-command-error" role="alert">{commandError}</p> : null}

        <FieldValidation id="builder-object-list">
        {document.objects.length === 0 ? <p className="builder-object-empty">Add a shape to start building this scene.</p> : (
          <BuilderObjectList objects={document.objects} composition={document.composition} selectedObjectId={selectedObjectId}
            onSelectObject={onSelectObject} onMoveObject={onMoveObject} checkedIds={checked}
            onToggleChecked={id => setCheckedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])} />
        )}
        </FieldValidation>

        <div className="builder-object-section__add">
          <select aria-label="Shape" className="mage-select" id="builder-add-shape" value={newShape}
            onChange={event => setNewShape(event.currentTarget.value as BuilderShape)}>
            {BUILDER_SHAPES.map(shape => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
          </select>
          <button className="scene-secondary-button" type="button"
            disabled={document.objects.length >= BUILDER_LIMITS.objects || builderSceneExpandedCount(document) >= BUILDER_EXPANDED_PRIMITIVE_LIMIT}
            onClick={() => onAddObject(newShape)}>Add object</button>
        </div>
      </aside>

      {selectedGroup ? <BuilderGroupInspector document={document} group={selectedGroup}
        issues={builderGroupFieldIssues(allIssues, builderGroups(document).findIndex(group => group.id === selectedGroup.id))}
        onDuplicate={onDuplicateObject} onRemove={onRemoveObject} onUngroup={onUngroupNode} onMove={onReparentNode} onUpdate={onUpdateGroup} /> : null}

      {selected ? <FieldErrorsContext.Provider value={selectedIssues}><section className="builder-object-editor builder-object-inspector" aria-labelledby="builder-object-editor-title">
        <header className="builder-object-editor__heading">
          <div>
            <h3 className="builder-object-editor__title" id="builder-object-editor-title">Selected object</h3>
            <p>{selected.name} · {shapeLabel(selected)}</p>
          </div>

          <BuilderObjectActions canDuplicate={document.objects.length < BUILDER_LIMITS.objects
            && builderSceneExpandedCount(document) + builderObjectExpandedCount(selected) <= BUILDER_EXPANDED_PRIMITIVE_LIMIT}
            onDuplicate={() => onDuplicateObject(selected.id)} onRemove={() => onRemoveObject(selected.id)} />
        </header>

        <div className="builder-object-inspector__body">
          <BuilderParentControl document={document} id={selected.id} onMove={onReparentNode} />
          <div className="builder-object-identity">
            <FieldValidation id="builder-object-name">
              <EditorFieldShell htmlFor="builder-object-name" label="Name">
                <input aria-invalid={Boolean(nameIssue)} aria-describedby={nameIssue ? 'builder-object-name-error' : undefined}
                  className="scene-text-input" id="builder-object-name" maxLength={BUILDER_LIMITS.nameLength} value={selected.name}
                  onChange={event => update(object => ({ ...object, name: event.currentTarget.value }))} />
              </EditorFieldShell>
            </FieldValidation>
            <SelectField id="builder-object-shape" label="Shape" fieldClassName="builder-shape-field" value={selected.operation.type}
              options={BUILDER_SHAPES} onChange={value => update(object => ({ ...object, operation: createBuilderOperation(value as BuilderShape) }))} />
          </div>

          <InspectorSection title="Size" fieldPrefixes={builderOperationFields(selected.operation).map(field => `builder-${field.key}`)} description="Shape dimensions" status={sizeSummary(selected)}>
            <SizeControls key={`${selected.id}-${selected.operation.type}`} object={selected}
              update={operation => update(object => ({ ...object, operation }))} />
          </InspectorSection>

          <InspectorSection title="Transform" fieldPrefixes={['builder-position-', 'builder-rotation-', 'builder-scale-']} description="Position, rotation, and scale" status={vectorSummary(selected)}>
            <TransformControls key={selected.id} transform={selected.transform} update={transform => update(object => ({ ...object, transform }))} />
          </InspectorSection>

          {selected.frame ? <InspectorSection title="Placement" fieldPrefixes={['builder-frame-']} description="Placement retained from a group" status={vectorSummary({ transform: selected.frame })}>
            <p className="field-hint">Moving or ungrouping preserves placement here, so arrangements and animation stay intact.</p>
            <TransformControls key={selected.id} idPrefix="builder-frame" labelPrefix="Placement " transform={selected.frame}
              update={frame => update(object => ({ ...object, frame }))} />
          </InspectorSection> : null}

          <InspectorSection title="Modifiers" fieldPrefixes={['builder-modifier-']} description="Expand, Shell, or Twist"
            status={selected.modifiers.length ? selected.modifiers.map(modifier => modifier.type).join(', ') : 'None'}>
            <ModifierControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Arrangement" fieldPrefixes={['builder-arrangement-']} description="Repeat the object in a line or ring"
            status={selected.arrangements.length ? selected.arrangements.map(arrangement => arrangement.type === 'linear' ? 'Line' : 'Ring').join(', ') : 'Single copy'}>
            <ArrangementControls document={document} key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Animation" fieldPrefixes={['builder-motion-', 'builder-driver-', 'builder-drivers']} description="Pulse, wobble, spin, and combine inputs"
            status={selected.drivers?.length ? `${selected.drivers.length} influences` : selected.motion.type === 'spin' ? `Spin ${selected.motion.axis.toUpperCase()}` : 'Off'}>
            {selected.motion.type === 'spin' ? <AnimationControls key={selected.id} object={selected} update={object => update(() => object)} /> : null}
            <BuilderDriverControls key={`drivers-${selected.id}`} node={selected} onChange={update} />
          </InspectorSection>

          <BuilderBindingControls key={selected.id} object={selected} document={document} onChange={update} />

          <InspectorSection title="Appearance" fieldPrefixes={['builder-color', 'builder-metalness', 'builder-shininess']} description="Color and material response" status={selected.material.color.toUpperCase()}>
            <AppearanceControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>
        </div>
      </section></FieldErrorsContext.Provider> : null}
    </div>
    <div className="builder-object-inspector__body">
      <InspectorSection title="Rendering" fieldPrefixes={['builder-rendering-']} description="Advanced detail and raymarch settings"
        status={`${rendering.maxIterations} steps · ${conciseNumber(rendering.stepSize)} step size`}>
        <SliderField id="builder-rendering-maxIterations" label="Maximum steps" min={BUILDER_RENDER_SETTINGS.maxIterations.minimum}
          max={BUILDER_RENDER_SETTINGS.maxIterations.maximum} step={1} value={rendering.maxIterations}
          description="More steps can reveal fine details, but take more work to render."
          onChange={value => updateRendering('maxIterations', value)} />
        <SliderField id="builder-rendering-stepSize" label="Step size" min={BUILDER_RENDER_SETTINGS.stepSize.minimum}
          max={BUILDER_RENDER_SETTINGS.stepSize.maximum} step={.005} numericStep="any" value={rendering.stepSize}
          description="Smaller steps can improve thin surfaces, but may need a higher maximum to reach them."
          onChange={value => updateRendering('stepSize', value)} />
      </InspectorSection>
    </div>
  </section>
}
