import { useEffect, useId, useRef, useState } from 'react'
import { type BuilderObject, type BuilderSceneDocument } from '@modules/player'
import { AppIcon, EditorFieldShell } from '@shared/ui'
import { BUILDER_SHAPES, createBuilderOperation, type BuilderShape } from '../builderEditor'
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

function OperationControls({ object, update }: { object: BuilderObject; update: (operation: BuilderObject['operation']) => void }) {
  const operation = object.operation
  if (operation.type === 'box') return <div className="scene-editor-grid scene-editor-grid--3">
    <NumberField id="builder-width" label="Width" min={0.01} max={10} value={operation.width} onChange={width => update({ ...operation, width })} />
    <NumberField id="builder-height" label="Height" min={0.01} max={10} value={operation.height} onChange={height => update({ ...operation, height })} />
    <NumberField id="builder-depth" label="Depth" min={0.01} max={10} value={operation.depth} onChange={depth => update({ ...operation, depth })} />
  </div>
  if (operation.type === 'torus') return <div className="scene-editor-grid">
    <NumberField id="builder-radius" label="Radius" min={0.01} max={10} value={operation.radius} onChange={radius => update({ ...operation, radius })} />
    <NumberField id="builder-tube" label="Tube thickness" min={0.01} max={5} value={operation.tube} onChange={tube => update({ ...operation, tube })} />
  </div>
  if (operation.type === 'cylinder') return <div className="scene-editor-grid">
    <NumberField id="builder-radius" label="Radius" min={0.01} max={10} value={operation.radius} onChange={radius => update({ ...operation, radius })} />
    <NumberField id="builder-height" label="Height" min={0.01} max={10} value={operation.height} onChange={height => update({ ...operation, height })} />
  </div>
  return <NumberField id="builder-radius" label="Radius" min={0.01} max={10} value={operation.radius}
    onChange={radius => update({ ...operation, radius })} />
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
  const colorIssue = useSceneEditorFieldIssue('builder-color')

  return <>
    <section className="builder-object-section" aria-labelledby="builder-objects-title">
      <div className="builder-object-section__heading">
        <div>
          <h3 className="builder-object-section__title" id="builder-objects-title">Objects</h3>
          <p className="field-hint">Add up to 16 shapes. Select one to edit it.</p>
        </div>
        <div className="builder-object-section__add">
          <select aria-label="Shape" className="mage-select" id="builder-add-shape" value={newShape}
            onChange={event => setNewShape(event.currentTarget.value as BuilderShape)}>
            {BUILDER_SHAPES.map(shape => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
          </select>
          <button className="scene-secondary-button" type="button" disabled={document.objects.length >= 16}
            onClick={() => onAddObject(newShape)}>Add object</button>
        </div>
      </div>

      {document.objects.length === 0 ? <p className="builder-object-empty">Add a shape to start building this scene.</p> : (
        <div className="builder-object-list" id="builder-object-list" role="group" aria-label="Scene objects">
          {document.objects.map(object => <button key={object.id} className="builder-object-list__item" type="button"
            aria-label={`${object.name}, ${BUILDER_SHAPES.find(shape => shape.value === object.operation.type)?.label}`}
            aria-pressed={object.id === selectedObjectId} onClick={() => onSelectObject(object.id)}>
            <span>{object.name}</span><span>{BUILDER_SHAPES.find(shape => shape.value === object.operation.type)?.label}</span>
          </button>)}
        </div>
      )}
    </section>

    {selected ? <section className="builder-object-editor" aria-labelledby="builder-object-editor-title">
      <div className="builder-object-editor__heading">
        <h3 className="builder-object-editor__title" id="builder-object-editor-title">Selected object</h3>
        <BuilderObjectActions canDuplicate={document.objects.length < 16}
          onDuplicate={() => onDuplicateObject(selected.id)} onRemove={() => onRemoveObject(selected.id)} />
      </div>
      <div className="builder-object-identity">
        <FieldValidation id="builder-object-name">
          <EditorFieldShell htmlFor="builder-object-name" label="Name">
            <input {...nameIssue.attributes} className="scene-text-input" id="builder-object-name" maxLength={80} value={selected.name}
              onChange={event => update(object => ({ ...object, name: event.currentTarget.value }))} />
          </EditorFieldShell>
        </FieldValidation>
        <SelectField id="builder-object-shape" label="Shape" fieldClassName="builder-shape-field" value={selected.operation.type}
          options={BUILDER_SHAPES} onChange={value => update(object => ({ ...object, operation: createBuilderOperation(value as BuilderShape) }))} />
      </div>

      <h4 className="builder-object-editor__subheading">Size</h4>
      <div className="builder-size-controls">
        <OperationControls object={selected} update={operation => update(object => ({ ...object, operation }))} />
      </div>

      <h4 className="builder-object-editor__subheading">Transform</h4>
      <div className="scene-editor-stack builder-transform-controls">
        <Vector3Field id="builder-position" label="Position" min={-100} max={100} value={selected.transform.position}
          onChange={position => update(object => ({ ...object, transform: { ...object.transform, position } }))} />
        <Vector3Field id="builder-rotation" label="Rotation" min={-Math.PI * 2} max={Math.PI * 2} step={0.01} value={selected.transform.rotation}
          onChange={rotation => update(object => ({ ...object, transform: { ...object.transform, rotation } }))} />
        <Vector3Field id="builder-scale" label="Scale" min={0.01} max={20} value={selected.transform.scale}
          onChange={scale => update(object => ({ ...object, transform: { ...object.transform, scale } }))} />
      </div>

      <h4 className="builder-object-editor__subheading">Appearance</h4>
      <div className="scene-editor-grid">
        <FieldValidation id="builder-color">
          <EditorFieldShell fieldClassName="builder-color-field" htmlFor="builder-color" label="Color">
            <input {...colorIssue.attributes} className="scene-color-input" id="builder-color" type="color" value={selected.material.color}
              onChange={event => update(object => ({ ...object, material: { ...object.material, color: event.currentTarget.value } }))} />
          </EditorFieldShell>
        </FieldValidation>
        <SliderField id="builder-metalness" label="Metalness" min={0} max={1} step={0.01} value={selected.material.metalness}
          onChange={metalness => update(object => ({ ...object, material: { ...object.material, metalness } }))} />
        <SliderField id="builder-shininess" label="Shininess" min={0} max={1} step={0.01} value={selected.material.shininess}
          onChange={shininess => update(object => ({ ...object, material: { ...object.material, shininess } }))} />
      </div>
    </section> : null}
  </>
}
