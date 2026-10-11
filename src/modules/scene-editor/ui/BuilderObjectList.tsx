import { useId, useState } from 'react'
import { BUILDER_OPERATIONS, type BuilderObject } from '@modules/player'
import { AppIcon, usePointerReorder } from '@shared/ui'

type Props = {
  objects: BuilderObject[]
  selectedObjectId: string | null
  onSelectObject: (objectId: string) => void
  onMoveObject: (objectId: string, targetId: string) => void
}

export function BuilderObjectList({ objects, selectedObjectId, onSelectObject, onMoveObject }: Props) {
  const instructionsId = useId()
  const [announcement, setAnnouncement] = useState('')
  const move = (sourceId: string, targetId: string) => {
    const object = objects.find(item => item.id === sourceId)
    const targetIndex = objects.findIndex(item => item.id === targetId)
    if (!object || targetIndex < 0 || sourceId === targetId) return
    onMoveObject(sourceId, targetId)
    setAnnouncement(`Moved ${object.name} to position ${targetIndex + 1} of ${objects.length}.`)
  }
  const { listRef, draggedId, overId, getHandleProps } = usePointerReorder({
    itemIds: objects.map(object => object.id), onMove: move,
  })
  const draggedIndex = objects.findIndex(object => object.id === draggedId)

  return <>
    <p className="builder-object-list__instructions field-hint" id={instructionsId}>
      Click a row to select. Drag <AppIcon name="grip-vertical" size={12} /> or use the arrows to change order.
    </p>
    <div className="builder-object-list" id="builder-object-list" role="group" aria-label="Scene objects" ref={listRef} tabIndex={-1}>
      {objects.map((object, index) => {
        const shape = BUILDER_OPERATIONS[object.operation.type]
        const selected = object.id === selectedObjectId
        return <div className="builder-object-list__item" key={object.id} data-reorder-id={object.id}
          data-selected={selected || undefined} data-dragging={draggedId === object.id || undefined}
          data-drop-position={overId === object.id ? draggedIndex < index ? 'after' : 'before' : undefined}>
          <button className="builder-object-list__grip" type="button" aria-label={`Drag ${object.name} to reorder`}
            aria-describedby={instructionsId} disabled={objects.length < 2} title="Drag to reorder, or use the Up and Down arrow keys"
            {...getHandleProps(object.id)}>
            <AppIcon name="grip-vertical" size={16} />
          </button>
          <button className="builder-object-list__select" type="button" aria-label={`${object.name}, ${shape.label}`}
            aria-pressed={selected} onClick={() => onSelectObject(object.id)}>
            <span className="builder-object-list__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="builder-object-list__icon" aria-hidden="true">{shape.glyph}</span>
            <span className="builder-object-list__copy"><strong>{object.name}</strong><span>{shape.label}</span></span>
            {selected ? <span className="builder-object-list__editing" aria-hidden="true">Editing</span> : null}
          </button>
          <div className="builder-object-list__actions">
            <button className="builder-object-list__arrow" type="button" aria-label={`Move ${object.name} up`}
              title="Move up" disabled={index === 0} onClick={() => move(object.id, objects[index - 1].id)}>
              <AppIcon name="arrow-up" size={14} />
            </button>
            <button className="builder-object-list__arrow" type="button" aria-label={`Move ${object.name} down`}
              title="Move down" disabled={index === objects.length - 1} onClick={() => move(object.id, objects[index + 1].id)}>
              <AppIcon name="arrow-down" size={14} />
            </button>
          </div>
        </div>
      })}
    </div>
    <p className="builder-object-list__announcement" role="status" aria-live="polite">{announcement}</p>
  </>
}
