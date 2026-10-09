import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { BUILDER_OPERATIONS, BUILDER_LIMITS, BUILDER_TRANSFORMS, BUILDER_MATERIAL, BUILDER_MODIFIERS,
  BUILDER_ARRANGEMENTS, BUILDER_SPIN, builderOperationFields, createBuilderModifier, createBuilderArrangement,
  type BuilderArrangement, type BuilderDimension, type BuilderModifier, type BuilderObject, type BuilderSceneDocument } from '@modules/player'
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
import { useSceneEditorFieldIssue } from './sceneEditorFieldErrors'

type Props = {
  document: BuilderSceneDocument
  onAddObject: (shape: BuilderShape) => void
  onDuplicateObject: (objectId: string) => void
  onRemoveObject: (objectId: string) => void
  onSelectObject: (objectId: string) => void
  onUpdateObject: (objectId: string, recipe: (object: BuilderObject) => BuilderObject) => void
  selectedObjectId: string | null
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

function BuilderControlStage({ children, description, index, onRemove, onToggle, open, removeLabel, summary, title, titleAddon, toggleLabel }: {
  children: ReactNode
  description: string
  index?: number
  onRemove?: () => void
  onToggle: () => void
  open: boolean
  removeLabel?: string
  summary: string[]
  title: string
  titleAddon?: ReactNode
  toggleLabel: string
}) {
  const headingId = useId()
  const contentId = useId()
  return <section aria-label={`${title} controls`} className={`builder-control-stage${index === undefined ? ' builder-control-stage--unnumbered' : ''}${open ? ' is-open' : ''}`}>
    <header className="builder-control-stage__header">
      {index === undefined ? null : <span className="builder-control-stage__number">{index + 1}</span>}
      <span className="builder-control-stage__identity">
        <span className="builder-control-stage__title-line"><strong id={headingId}>{title}</strong>{titleAddon}</span>
        <span className="builder-control-stage__description">{description}</span>
      </span>
      <span className="builder-control-stage__summary" aria-label={`${title} summary`}>
        {summary.map(item => <span key={item}>{item}</span>)}
      </span>
      <button aria-controls={contentId} aria-expanded={open} aria-label={toggleLabel}
        className="builder-control-stage__toggle" type="button" onClick={onToggle}>
        <span className="builder-control-stage__chevron" aria-hidden="true" />
      </button>
    </header>
    {open ? <div className="builder-control-stage__content" id={contentId}>
      {children}
      {onRemove ? <button aria-label={removeLabel} className="builder-control-stage__remove" type="button" onClick={onRemove}>Remove</button> : null}
    </div> : null}
  </section>
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

  return <BuilderControlStage description={description} index={index} onRemove={onRemove} onToggle={onToggle} open={open}
    removeLabel={`Remove ${title} arrangement ${index + 1}`}
    summary={[`Count: ${arrangement.count}`, arrangement.type === 'linear' ? `Spacing: ${arrangement.spacing}` : `Radius: ${arrangement.radius}`]}
    title={title} toggleLabel={`${open ? 'Collapse' : 'Expand'} ${title} arrangement ${index + 1}`}>
      <div className="scene-editor-grid scene-editor-grid--3">
        <NumberField id={`builder-arrangement-${index}-count`} label="Count" min={definition.count.minimum} max={maxCount} step={1} value={arrangement.count}
          onChange={count => replace({ ...arrangement, count: Math.min(count, maxCount) })} />
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
        return <BuilderControlStage description={description} index={index} key={modifier.type}
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
      return <BuilderControlStage description={control.description} key={control.key}
        onToggle={() => setOpenControl(current => current === control.key ? null : control.key)} open={open}
        summary={[conciseNumber(control.value)]} title={control.title}
        toggleLabel={`${open ? 'Collapse' : 'Expand'} ${control.title} size`}>
        <NumberField id={`builder-${control.key}`} label={control.title} min={control.minimum} max={control.maximum} value={control.value}
          onChange={value => change(control, value)} />
      </BuilderControlStage>
    })}
  </div>
}

function BuilderObjectActions({ canDuplicate, onDuplicate, onRemove }: { canDuplicate: boolean; onDuplicate: () => void; onRemove: () => void }) {
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
      <button className="builder-object-actions__remove" type="button" role="menuitem" onClick={() => run(onRemove)}>Remove</button>
    </div> : null}
  </div>
}

const shapeLabel = (object: BuilderObject) => BUILDER_OPERATIONS[object.operation.type].label
const shapeGlyph = (object: BuilderObject) => BUILDER_OPERATIONS[object.operation.type].glyph

function sizeSummary(object: BuilderObject) {
  const operation = object.operation
  if (operation.type === 'box') return `${operation.width} × ${operation.height} × ${operation.depth}`
  if (operation.type === 'torus') return `Radius ${operation.radius} · Tube ${operation.tube}`
  if (operation.type === 'cylinder') return `Radius ${operation.radius} · Height ${operation.height}`
  return `Radius ${operation.radius}`
}

function conciseNumber(value: number) {
  return Number(value.toFixed(2)).toString()
}

function conciseVector(vector: { x: number; y: number; z: number }) {
  return `${conciseNumber(vector.x)}, ${conciseNumber(vector.y)}, ${conciseNumber(vector.z)}`
}

function vectorSummary(object: BuilderObject) {
  const { position, rotation, scale } = object.transform
  const parts = [`Position ${conciseVector(position)}`]
  if (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) parts.push(`Rotation ${conciseVector(rotation)}`)
  parts.push(scale.x === scale.y && scale.y === scale.z
    ? `Scale ${conciseNumber(scale.x)}×`
    : `Scale ${conciseNumber(scale.x)} × ${conciseNumber(scale.y)} × ${conciseNumber(scale.z)}`)
  return parts.join(' · ')
}

function TransformControls({ object, update }: { object: BuilderObject; update: (object: BuilderObject) => void }) {
  const [openStage, setOpenStage] = useState<'position' | 'rotation' | 'scale' | null>(null)
  const toggle = (stage: 'position' | 'rotation' | 'scale') => setOpenStage(current => current === stage ? null : stage)
  return <div className="builder-transform-stages">
    <BuilderControlStage description="Move the object through the scene." onToggle={() => toggle('position')}
      open={openStage === 'position'} summary={[conciseVector(object.transform.position)]} title="Position"
      toggleLabel={`${openStage === 'position' ? 'Collapse' : 'Expand'} Position transform`}>
      <Vector3Field id="builder-position" label="Position" min={BUILDER_TRANSFORMS.position.properties.x.minimum} max={BUILDER_TRANSFORMS.position.properties.x.maximum} value={object.transform.position}
        onChange={position => update({ ...object, transform: { ...object.transform, position } })} />
    </BuilderControlStage>
    <BuilderControlStage description="Turn the object around each axis." onToggle={() => toggle('rotation')}
      open={openStage === 'rotation'} summary={[conciseVector(object.transform.rotation)]} title="Rotation"
      toggleLabel={`${openStage === 'rotation' ? 'Collapse' : 'Expand'} Rotation transform`}>
      <Vector3Field id="builder-rotation" label="Rotation" min={BUILDER_TRANSFORMS.rotation.properties.x.minimum} max={BUILDER_TRANSFORMS.rotation.properties.x.maximum} step={0.01} value={object.transform.rotation}
        onChange={rotation => update({ ...object, transform: { ...object.transform, rotation } })} />
    </BuilderControlStage>
    <BuilderControlStage description="Resize the object along each axis." onToggle={() => toggle('scale')}
      open={openStage === 'scale'} summary={[conciseVector(object.transform.scale)]} title="Scale"
      toggleLabel={`${openStage === 'scale' ? 'Collapse' : 'Expand'} Scale transform`}>
      <Vector3Field id="builder-scale" label="Scale" min={BUILDER_TRANSFORMS.scale.properties.x.minimum} max={BUILDER_TRANSFORMS.scale.properties.x.maximum} value={object.transform.scale}
        onChange={scale => update({ ...object, transform: { ...object.transform, scale } })} />
    </BuilderControlStage>
  </div>
}

function InspectorSection({ children, description, status, title }: {
  children: ReactNode
  description: string
  status: string
  title: string
}) {
  return <details className="builder-inspector-section">
    <summary>
      <span className="builder-inspector-section__title">
        <h4 className="builder-object-editor__subheading">{title}</h4>
        <span>{description}</span>
      </span>
      <span className="builder-inspector-section__status">{status}</span>
      <span className="builder-inspector-section__chevron" aria-hidden="true" />
    </summary>
    <div className="builder-inspector-section__content">{children}</div>
  </details>
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
    <BuilderControlStage description="Rotate the object continuously around one axis." onToggle={() => setOpen(value => !value)} open={open}
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

function AppearanceControls({ object, update }: { object: BuilderObject; update: (object: BuilderObject) => void }) {
  const [openControl, setOpenControl] = useState<'color' | 'metalness' | 'shininess' | null>(null)
  const toggle = (control: 'color' | 'metalness' | 'shininess') => setOpenControl(current => current === control ? null : control)
  return <div className="builder-appearance-stages">
    <BuilderControlStage description="Choose the object's base color." onToggle={() => toggle('color')}
      open={openControl === 'color'} summary={[object.material.color.toUpperCase()]} title="Color"
      toggleLabel={`${openControl === 'color' ? 'Collapse' : 'Expand'} Color appearance`}>
      <FieldValidation id="builder-color">
        <EditorFieldShell fieldClassName="builder-color-field" htmlFor="builder-color" label="Color">
          <BuilderColorControl key={`${object.id}-${object.material.color}`} value={object.material.color}
            onChange={color => update({ ...object, material: { ...object.material, color } })} />
        </EditorFieldShell>
      </FieldValidation>
    </BuilderControlStage>
    <BuilderControlStage description="Control how strongly the surface reflects its environment." onToggle={() => toggle('metalness')}
      open={openControl === 'metalness'} summary={[conciseNumber(object.material.metalness)]} title="Metalness"
      toggleLabel={`${openControl === 'metalness' ? 'Collapse' : 'Expand'} Metalness appearance`}>
      <SliderField id="builder-metalness" label="Metalness" min={BUILDER_MATERIAL.metalness.minimum} max={BUILDER_MATERIAL.metalness.maximum} step={0.01} value={object.material.metalness}
        onChange={metalness => update({ ...object, material: { ...object.material, metalness } })} />
    </BuilderControlStage>
    <BuilderControlStage description="Control the brightness and focus of highlights." onToggle={() => toggle('shininess')}
      open={openControl === 'shininess'} summary={[conciseNumber(object.material.shininess)]} title="Shininess"
      toggleLabel={`${openControl === 'shininess' ? 'Collapse' : 'Expand'} Shininess appearance`}>
      <SliderField id="builder-shininess" label="Shininess" min={BUILDER_MATERIAL.shininess.minimum} max={BUILDER_MATERIAL.shininess.maximum} step={0.01} value={object.material.shininess}
        onChange={shininess => update({ ...object, material: { ...object.material, shininess } })} />
    </BuilderControlStage>
  </div>
}

export function BuilderSceneControls({
  document,
  onAddObject,
  onDuplicateObject,
  onRemoveObject,
  onSelectObject,
  onUpdateObject,
  selectedObjectId,
}: Props) {
  const [newShape, setNewShape] = useState<BuilderShape>('sphere')
  const selected = document.objects.find(object => object.id === selectedObjectId) ?? null
  const update = (recipe: (object: BuilderObject) => BuilderObject) => {
    if (selected) onUpdateObject(selected.id, recipe)
  }
  const nameIssue = useSceneEditorFieldIssue('builder-object-name')

  return <section className="builder-workspace" aria-labelledby="builder-workspace-title">
    <header className="builder-workspace__header">
      <div className="builder-workspace__title">
        <h3 id="builder-workspace-title">Builder workspace</h3>
        <span>{document.objects.length} of {BUILDER_LIMITS.objects} objects</span>
      </div>
      <p className="field-hint">Select an object to edit it.</p>
    </header>

    <div className="builder-layout">
      <aside className="builder-object-section builder-object-rail" aria-labelledby="builder-objects-title">
        <div className="builder-object-rail__header">
          <h3 className="builder-object-section__title" id="builder-objects-title">Objects</h3>
          <p className="field-hint">Keep the object list visible while editing.</p>
        </div>

        {document.objects.length === 0 ? <p className="builder-object-empty">Add a shape to start building this scene.</p> : (
          <div className="builder-object-list" id="builder-object-list" role="group" aria-label="Scene objects">
            {document.objects.map(object => <button key={object.id} className="builder-object-list__item" type="button"
              aria-label={`${object.name}, ${shapeLabel(object)}`}
              aria-pressed={object.id === selectedObjectId} onClick={() => onSelectObject(object.id)}>
              <span className="builder-object-list__icon" aria-hidden="true">{shapeGlyph(object)}</span>
              <span className="builder-object-list__copy"><strong>{object.name}</strong><span>{shapeLabel(object)}</span></span>
            </button>)}
          </div>
        )}

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

      {selected ? <section className="builder-object-editor builder-object-inspector" aria-labelledby="builder-object-editor-title">
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
          <div className="builder-object-identity">
            <FieldValidation id="builder-object-name">
              <EditorFieldShell htmlFor="builder-object-name" label="Name">
                <input {...nameIssue.attributes} className="scene-text-input" id="builder-object-name" maxLength={BUILDER_LIMITS.nameLength} value={selected.name}
                  onChange={event => update(object => ({ ...object, name: event.currentTarget.value }))} />
              </EditorFieldShell>
            </FieldValidation>
            <SelectField id="builder-object-shape" label="Shape" fieldClassName="builder-shape-field" value={selected.operation.type}
              options={BUILDER_SHAPES} onChange={value => update(object => ({ ...object, operation: createBuilderOperation(value as BuilderShape) }))} />
          </div>

          <InspectorSection title="Size" description="Shape dimensions" status={sizeSummary(selected)}>
            <SizeControls key={`${selected.id}-${selected.operation.type}`} object={selected}
              update={operation => update(object => ({ ...object, operation }))} />
          </InspectorSection>

          <InspectorSection title="Transform" description="Position, rotation, and scale" status={vectorSummary(selected)}>
            <TransformControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Modifiers" description="Expand, Shell, or Twist"
            status={selected.modifiers.length ? selected.modifiers.map(modifier => modifier.type).join(', ') : 'None'}>
            <ModifierControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Arrangement" description="Repeat the object in a line or ring"
            status={selected.arrangements.length ? selected.arrangements.map(arrangement => arrangement.type === 'linear' ? 'Line' : 'Ring').join(', ') : 'Single copy'}>
            <ArrangementControls document={document} key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Animation" description="Object-specific movement"
            status={selected.motion.type === 'spin' ? `Spin ${selected.motion.axis.toUpperCase()}` : 'Off'}>
            <AnimationControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>

          <InspectorSection title="Appearance" description="Color and material response" status={selected.material.color.toUpperCase()}>
            <AppearanceControls key={selected.id} object={selected} update={object => update(() => object)} />
          </InspectorSection>
        </div>
      </section> : null}
    </div>
  </section>
}
