import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

type Options<T extends string> = {
  itemIds: readonly T[]
  onMove: (sourceId: T, targetId: T) => void
}

type Drag<T extends string> = {
  id: T
  pointerId: number
  handle: HTMLElement
  startX: number
  startY: number
  moved: boolean
}

function releaseCapture(drag: Drag<string> | null) {
  if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId)
}

/** Shared handle dragging; callers own row presentation and commit one move on drop. */
export function usePointerReorder<T extends string>({ itemIds, onMove }: Options<T>) {
  const listElement = useRef<HTMLElement | null>(null)
  const activeDrag = useRef<Drag<T> | null>(null)
  const [draggedId, setDraggedId] = useState<T | null>(null)
  const [overId, setOverId] = useState<T | null>(null)

  const cancel = useCallback(() => {
    const drag = activeDrag.current
    activeDrag.current = null
    releaseCapture(drag)
    setDraggedId(null)
    setOverId(null)
  }, [])

  const listRef = useCallback((node: HTMLElement | null) => {
    listElement.current = node
    if (!node) cancel()
  }, [cancel])

  useEffect(() => {
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || !activeDrag.current) return
      event.preventDefault()
      cancel()
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      const drag = activeDrag.current
      activeDrag.current = null
      releaseCapture(drag)
    }
  }, [cancel])

  function targetAtPointer(event: PointerEvent<HTMLElement>) {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-reorder-id]')
    const id = row?.dataset.reorderId
    return row && listElement.current?.contains(row) && itemIds.includes(id as T) ? id as T : null
  }

  function updateMovement(drag: Drag<T>, event: PointerEvent<HTMLElement>) {
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4
  }

  function getHandleProps(id: T) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || !event.isPrimary || activeDrag.current || itemIds.length < 2 || !itemIds.includes(id)) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        activeDrag.current = { id, pointerId: event.pointerId, handle: event.currentTarget,
          startX: event.clientX, startY: event.clientY, moved: false }
        setDraggedId(id)
        setOverId(null)
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const drag = activeDrag.current
        if (!drag || drag.pointerId !== event.pointerId) return
        event.preventDefault()
        updateMovement(drag, event)
        const targetId = drag.moved && itemIds.includes(drag.id) ? targetAtPointer(event) : null
        setOverId(targetId === drag.id ? null : targetId)
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const drag = activeDrag.current
        if (!drag || drag.pointerId !== event.pointerId) return
        updateMovement(drag, event)
        const targetId = drag.moved ? targetAtPointer(event) : null
        cancel()
        if (targetId && targetId !== drag.id && itemIds.includes(drag.id)) onMove(drag.id, targetId)
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) {
        if (activeDrag.current?.pointerId === event.pointerId) cancel()
      },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (activeDrag.current?.pointerId === event.pointerId) cancel()
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'Escape') { cancel(); return }
        if (activeDrag.current || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        const index = itemIds.indexOf(id)
        if (index < 0) return
        event.preventDefault()
        const targetId = itemIds[index + (event.key === 'ArrowUp' ? -1 : 1)]
        if (targetId) onMove(id, targetId)
      },
    }
  }

  return { listRef, draggedId, overId, getHandleProps }
}
