import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { addBuilderObject, createBuilderScene } from '../builderEditor'
import { BuilderObjectList } from './BuilderObjectList'
import { groupBuilderNodes, reparentBuilderNode } from '../builderGroups'

it('reveals the selected child after moving it into a collapsed group without changing its ID', async () => {
  const user = userEvent.setup()
  const scene = groupBuilderNodes(addBuilderObject(addBuilderObject(createBuilderScene(), 'box'), 'sphere'), ['object-1', 'object-2'], 'group-1')
  const props = { selectedObjectId: 'object-3', onSelectObject: vi.fn(), onMoveObject: vi.fn() }
  const { rerender } = render(<BuilderObjectList {...props} objects={scene.objects} composition={scene.composition} />)
  await user.click(screen.getByRole('button', { name: 'Collapse Group 1' }))
  expect(screen.queryByRole('button', { name: 'Sphere 1, Sphere' })).not.toBeInTheDocument()
  const moved = reparentBuilderNode(scene, 'object-3', 'group-1')
  rerender(<BuilderObjectList {...props} objects={moved.objects} composition={moved.composition} />)
  expect(screen.getByRole('button', { name: 'Collapse Group 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sphere 3, Sphere' })).toHaveAttribute('aria-pressed', 'true')
})

it('keeps row selection separate from reordering and exposes the list boundaries', async () => {
  const user = userEvent.setup()
  const document = addBuilderObject(createBuilderScene(), 'box')
  const onSelectObject = vi.fn()
  const onMoveObject = vi.fn()
  const { rerender } = render(<BuilderObjectList objects={document.objects} selectedObjectId="object-1"
    onSelectObject={onSelectObject} onMoveObject={onMoveObject} />)
  expect(screen.getByRole('button', { name: 'Move Sphere 1 up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Box 2 down' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Sphere 1, Sphere' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Move Box 2 up' }))
  expect(onMoveObject).toHaveBeenCalledExactlyOnceWith('object-2', 'object-1')
  expect(onSelectObject).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Box 2, Box' }))
  expect(onSelectObject).toHaveBeenCalledExactlyOnceWith('object-2')
  rerender(<BuilderObjectList objects={[...document.objects].reverse()} selectedObjectId="object-1"
    onSelectObject={onSelectObject} onMoveObject={onMoveObject} />)
  expect(screen.getByRole('button', { name: 'Move Box 2 up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Sphere 1 down' })).toBeDisabled()
  await user.tab()
  screen.getByRole('button', { name: 'Drag Sphere 1 to reorder' }).focus()
  await user.keyboard('{ArrowUp}')
  expect(onMoveObject).toHaveBeenLastCalledWith('object-1', 'object-2')
})
