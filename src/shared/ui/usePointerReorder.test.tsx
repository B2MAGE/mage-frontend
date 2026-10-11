import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePointerReorder } from './usePointerReorder'

function List({ ids = ['one', 'two', 'three'], onMove }: { ids?: string[]; onMove: (source: string, target: string) => void }) {
  const { listRef, draggedId, overId, getHandleProps } = usePointerReorder({ itemIds: ids, onMove })
  return <>
    <div ref={listRef} data-testid="list" data-dragged={draggedId} data-over={overId}>
      {[...ids, 'pinned'].map(id => <div data-reorder-id={id} data-testid={id} key={id}>
        <button type="button" {...getHandleProps(id)}>{id}</button>
      </div>)}
    </div>
    <div data-reorder-id="three" data-testid="other-list-row" />
  </>
}

function setup(ids?: string[]) {
  const onMove = vi.fn()
  const rendered = render(<List ids={ids} onMove={onMove} />)
  let target: Element | null = screen.getByTestId('three')
  const elementFromPoint = vi.fn(() => target)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })
  const handle = screen.getByRole('button', { name: 'one' })
  let captured = false
  const releasePointerCapture = vi.fn(() => { captured = false })
  Object.assign(handle, {
    setPointerCapture: vi.fn(() => { captured = true }),
    hasPointerCapture: vi.fn(() => captured),
    releasePointerCapture,
  })
  return { ...rendered, onMove, handle, releasePointerCapture, target: (id: string | null) => {
    target = id ? screen.getByTestId(id) : null
  } }
}

function pointer(target: HTMLElement, type: string, options: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean } = {}) {
  const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouseOptions } = options
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10, ...mouseOptions })
  Object.defineProperties(event, {
    pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: isPrimary },
  })
  fireEvent(target, event)
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementFromPoint')
})

describe('usePointerReorder', () => {
  it.each(['mouse', 'touch', 'pen'])('commits a %s drop once, without changing order while moving', pointerType => {
    const { handle, onMove, releasePointerCapture } = setup()
    pointer(handle, 'pointerdown', { pointerType })
    pointer(handle, 'pointermove', { pointerType, clientY: 80 })
    expect(screen.getByTestId('list')).toHaveAttribute('data-dragged', 'one')
    expect(screen.getByTestId('list')).toHaveAttribute('data-over', 'three')
    expect(onMove).not.toHaveBeenCalled()
    pointer(handle, 'pointerup', { pointerType, clientY: 80 })
    pointer(handle, 'lostpointercapture')
    pointer(handle, 'pointerup', { pointerType, clientY: 80 })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('one', 'three')
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1)
    expect(screen.getByTestId('list')).not.toHaveAttribute('data-dragged')
  })

  it.each([null, 'other-list-row', 'pinned', 'one'])('ignores drops onto %s', targetId => {
    const { handle, onMove, target } = setup()
    target(targetId)
    pointer(handle, 'pointerdown')
    pointer(handle, 'pointermove', { clientY: 80 })
    pointer(handle, 'pointerup', { clientY: 80 })
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.getByTestId('list')).not.toHaveAttribute('data-dragged')
  })

  it.each(['pointercancel', 'lostpointercapture', 'Escape'])('cancels through %s without committing', cancellation => {
    const { handle, onMove } = setup()
    pointer(handle, 'pointerdown')
    pointer(handle, 'pointermove', { clientY: 80 })
    if (cancellation === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
    else pointer(handle, cancellation)
    pointer(handle, 'pointerup', { clientY: 80 })
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.getByTestId('list')).not.toHaveAttribute('data-dragged')
  })

  it('ignores secondary pointers, right clicks, and another pointer ending the drag', () => {
    const { handle, onMove } = setup()
    pointer(handle, 'pointerdown', { isPrimary: false })
    pointer(handle, 'pointerdown', { button: 2 })
    expect(screen.getByTestId('list')).not.toHaveAttribute('data-dragged')
    pointer(handle, 'pointerdown')
    pointer(handle, 'pointermove', { pointerId: 2, clientY: 80 })
    pointer(handle, 'pointerup', { pointerId: 2, clientY: 80 })
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.getByTestId('list')).toHaveAttribute('data-dragged', 'one')
    pointer(handle, 'pointerup', { clientY: 80 })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('one', 'three')
  })

  it('requires a deliberate drag and ignores a target removed before release', () => {
    const { handle, onMove, rerender } = setup()
    pointer(handle, 'pointerdown')
    pointer(handle, 'pointerup', { clientY: 12 })
    expect(onMove).not.toHaveBeenCalled()
    pointer(handle, 'pointerdown')
    pointer(handle, 'pointermove', { clientY: 80 })
    rerender(<List ids={['one', 'two']} onMove={onMove} />)
    pointer(handle, 'pointerup', { clientY: 80 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('releases captured pointers when the list unmounts', () => {
    const { handle, onMove, releasePointerCapture, unmount } = setup()
    pointer(handle, 'pointerdown')
    unmount()
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('moves the focused handle with arrow keys and respects both boundaries', () => {
    const { handle, onMove } = setup()
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('one', 'two')
    fireEvent.keyDown(screen.getByRole('button', { name: 'three' }), { key: 'ArrowDown' })
    expect(onMove).toHaveBeenCalledTimes(1)
  })
})
