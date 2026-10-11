import { useId, useState } from 'react'
import { BUILDER_OPERATIONS, type BuilderComposition, type BuilderObject } from '@modules/player'
import { AppIcon, usePointerReorder } from '@shared/ui'
import { isBuilderGroup, type BuilderNode } from '../builderGroups'

type Props = {
  objects: BuilderObject[]
  composition?: BuilderComposition
  selectedObjectId: string | null
  onSelectObject: (objectId: string) => void
  onMoveObject: (objectId: string, targetId: string) => void
  checkedIds?: readonly string[]
  onToggleChecked?: (id: string) => void
}
type RowsProps = Props & { ids: string[]; depth: number; instructionsId: string; announce: (message: string) => void }

function BuilderObjectRows({ ids, depth, instructionsId, announce, ...props }: RowsProps) {
  const { objects, composition, selectedObjectId, onSelectObject, onMoveObject, checkedIds, onToggleChecked } = props
  const [collapsed, setCollapsed] = useState<string[]>([])
  const ancestors: string[] = []
  let ancestor = composition?.groups.find(group => group.children.includes(selectedObjectId ?? ''))
  while (ancestor && !ancestors.includes(ancestor.id)) {
    ancestors.push(ancestor.id)
    const id = ancestor.id
    ancestor = composition?.groups.find(group => group.children.includes(id))
  }
  const revealKey = `${selectedObjectId ?? ''}:${ancestors.join('/')}`
  const [previousSelection, setPreviousSelection] = useState(revealKey)
  const lookup = (id: string): BuilderNode | undefined => objects.find(item => item.id === id) ?? composition?.groups.find(item => item.id === id)
  if (previousSelection !== revealKey) {
    setPreviousSelection(revealKey)
    // Validation focus and history selection reveal the selected descendant.
    setCollapsed(current => current.filter(id => !ancestors.includes(id)))
  }
  const move = (sourceId: string, targetId: string) => {
    const node = lookup(sourceId)
    const targetIndex = ids.indexOf(targetId)
    if (!node || targetIndex < 0 || sourceId === targetId) return
    onMoveObject(sourceId, targetId)
    announce(`Moved ${node.name} to position ${targetIndex + 1} of ${ids.length}.`)
  }
  const { listRef, draggedId, overId, getHandleProps } = usePointerReorder({ itemIds: ids, onMove: move })
  const draggedIndex = ids.indexOf(draggedId ?? '')
  return <div className={`builder-object-list${depth ? ' builder-object-list--nested' : ''}`} role="group"
    aria-label={depth ? 'Group children' : 'Scene objects'} ref={listRef} tabIndex={-1}>
    {ids.map((id, index) => {
      const node = lookup(id)
      if (!node) return null
      const group = isBuilderGroup(node)
      const label = group ? `${node.children.length} items · ${node.operation.type === 'union' ? 'Union' : 'Smooth union'}` : BUILDER_OPERATIONS[node.operation.type].label
      const selected = id === selectedObjectId
      const expanded = !collapsed.includes(id)
      return <div className="builder-object-list__branch" key={id}>
        <div className={`builder-object-list__item${onToggleChecked ? ' builder-object-list__item--checkable' : ''}`} data-reorder-id={id}
          data-selected={selected || undefined} data-dragging={draggedId === id || undefined}
          data-drop-position={overId === id ? draggedIndex < index ? 'after' : 'before' : undefined}>
          {onToggleChecked ? <input className="builder-object-list__checkbox" type="checkbox" aria-label={`Include ${node.name} in group selection`}
            checked={checkedIds?.includes(id) ?? false} onChange={() => onToggleChecked(id)} /> : null}
          <button className="builder-object-list__grip" type="button" aria-label={`Drag ${node.name} to reorder`}
            aria-describedby={instructionsId} disabled={ids.length < 2} title="Drag to reorder, or use the Up and Down arrow keys" {...getHandleProps(id)}>
            <AppIcon name="grip-vertical" size={16} />
          </button>
          <button className="builder-object-list__select" type="button" aria-label={`${node.name}, ${group ? 'Group' : label}`}
            aria-pressed={selected} onClick={() => onSelectObject(id)}>
            <span className="builder-object-list__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="builder-object-list__icon" aria-hidden="true">{group ? <AppIcon name="layers" size={15} /> : BUILDER_OPERATIONS[node.operation.type].glyph}</span>
            <span className="builder-object-list__copy"><strong>{node.name}</strong><span>{label}</span></span>
            {selected ? <span className="builder-object-list__editing" aria-hidden="true">Editing</span> : null}
          </button>
          <div className="builder-object-list__actions">
            {group ? <button className="builder-object-list__arrow" type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
              aria-expanded={expanded} onClick={() => setCollapsed(current => expanded ? [...current, id] : current.filter(item => item !== id))}>
              <AppIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
            </button> : null}
            <button className="builder-object-list__arrow" type="button" aria-label={`Move ${node.name} up`} title="Move up"
              disabled={index === 0} onClick={() => move(id, ids[index - 1])}><AppIcon name="arrow-up" size={14} /></button>
            <button className="builder-object-list__arrow" type="button" aria-label={`Move ${node.name} down`} title="Move down"
              disabled={index === ids.length - 1} onClick={() => move(id, ids[index + 1])}><AppIcon name="arrow-down" size={14} /></button>
          </div>
        </div>
        {group && expanded ? <BuilderObjectRows {...props} ids={node.children} depth={depth + 1} instructionsId={instructionsId} announce={announce} /> : null}
      </div>
    })}
  </div>
}

export function BuilderObjectList(props: Props) {
  const instructionsId = useId()
  const [announcement, setAnnouncement] = useState('')
  return <>
    <p className="builder-object-list__instructions field-hint" id={instructionsId}>
      Click a row to edit. Drag <AppIcon name="grip-vertical" size={12} /> or use the arrows to reorder within its group.
      {props.onToggleChecked ? ' Check items to group them together.' : ''}
    </p>
    <div id="builder-object-list">
      <BuilderObjectRows {...props} ids={props.composition?.roots ?? props.objects.map(object => object.id)} depth={0}
        instructionsId={instructionsId} announce={setAnnouncement} />
    </div>
    <p className="builder-object-list__announcement" role="status" aria-live="polite">{announcement}</p>
  </>
}
