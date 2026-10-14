import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { parseSceneDocument, type BuilderObject, type BuilderSceneDocument } from '@modules/player'
import { createBuilderScene, updateBuilderObject } from '../builderEditor'
import { groupBuilderNodes, updateBuilderGroup } from '../builderGroups'
import { BuilderSceneControls } from './BuilderSceneControls'

function setup(initial: BuilderSceneDocument, selected = initial.objects[0].id) {
  const changed = vi.fn<(document: BuilderSceneDocument) => void>()
  function Harness() {
    const [document, setDocument] = useState(initial)
    const save = (next: BuilderSceneDocument) => { changed(next); setDocument(next) }
    return <BuilderSceneControls document={document} selectedObjectId={selected} commandError={null}
      onUpdateObject={(id, recipe) => save(updateBuilderObject(document, id, recipe))}
      onUpdateGroup={(id, recipe) => save(updateBuilderGroup(document, id, recipe))}
      onUpdateDocument={recipe => save(recipe(document))}
      onAddObject={vi.fn()} onDuplicateObject={vi.fn()} onRemoveObject={vi.fn()} onMoveObject={vi.fn()} onSelectObject={vi.fn()}
      onGroupNodes={vi.fn()} onUngroupNode={vi.fn()} onReparentNode={vi.fn()} />
  }
  render(<Harness />)
  return { changed, user: userEvent.setup(), current: () => changed.mock.calls.at(-1)?.[0] ?? initial }
}
const section = (name: string) => screen.getByRole('heading', { name, hidden: true }).closest('summary')!

describe('Builder deformation and material controls', () => {
  it.each<{ operation: BuilderObject['operation']; summary: string }>([
    { operation: { type: 'sphere', radius: .75 }, summary: 'Radius 0.75' },
    { operation: { type: 'box', width: 1, height: 2, depth: 3 }, summary: '1 × 2 × 3' },
    { operation: { type: 'torus', radius: .75, tube: .2 }, summary: 'Radius 0.75 · Tube 0.2' },
    { operation: { type: 'cylinder', radius: .75, height: 2 }, summary: 'Radius 0.75 · Height 2' },
    { operation: { type: 'box-frame', width: 1, height: 2, depth: 3, thickness: .12 }, summary: '1 × 2 × 3 · Edge 0.12' },
    { operation: { type: 'lattice', iterations: 2.5, spacing: .75, thickness: .00625 }, summary: '2.5 repetitions · Spacing 0.75 · Rod 0.00625' },
  ])('preserves the compact $operation.type size summary from shared field metadata', ({ operation, summary }) => {
    const initial = createBuilderScene()
    initial.objects[0].operation = operation
    const { changed } = setup(initial)
    expect(section('Size').querySelector('.builder-inspector-section__status')).toHaveTextContent(summary)
    expect(changed).not.toHaveBeenCalled()
  })

  it('opens precise color controls without rewriting and edits one channel without rounding its siblings', async () => {
    const initial = createBuilderScene()
    const color = { x: .08256470259178794, y: .782309705948631, z: .763003005740327 }
    initial.objects[0].material.color = color
    const { user, changed, current } = setup(initial)
    await user.click(section('Appearance'))
    await user.click(screen.getByRole('button', { name: 'Expand Color appearance' }))
    expect(screen.getByLabelText('Red')).toHaveValue(color.x)
    expect(screen.getByLabelText('Green')).toHaveValue(color.y)
    expect(changed).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Red'), { target: { value: '-0.125' } })
    expect(current().objects[0].material.color).toEqual({ ...color, x: -.125 })
    expect(parseSceneDocument(current())).toEqual(current())
    await user.click(screen.getByRole('button', { name: 'Add animated RGB' }))
    expect(current().objects[0].drivers?.map(driver => driver.target)).toEqual(['material.color.r', 'material.color.g', 'material.color.b'])
  })

  it('authors noise from scratch in Animation and edits drift, frequency and coordinate scope', async () => {
    const { user, current } = setup(createBuilderScene())
    await user.click(section('Animation'))
    await user.click(within(section('Animation').closest('details')!).getByRole('button', { name: 'Add noise deformation' }))
    expect(screen.getByRole('button', { name: 'Collapse Noise influence 1' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: '1.768209282106819' } })
    fireEvent.change(screen.getByLabelText('Drift Y'), { target: { value: '.1' } })
    await user.selectOptions(screen.getByLabelText('Coordinate space'), 'group-position')
    await user.selectOptions(screen.getByLabelText('Coordinate group'), '2')
    expect(JSON.stringify(current().objects[0].drivers)).toContain('"ancestor":2')
    expect(parseSceneDocument(current())).toEqual(current())
    await user.click(screen.getByRole('button', { name: 'Edit combined inputs' }))
    expect(screen.getAllByText('Noise', { exact: false, selector: 'summary span' }).length).toBeGreaterThan(0)
  })

  it('shares group modifiers but does not offer object-only Twist', async () => {
    const initial = createBuilderScene()
    const grouped = groupBuilderNodes(initial, [initial.objects[0].id], 'group-1')
    const { user, current } = setup(grouped, 'group-1')
    await user.click(section('Modifiers'))
    expect(Array.from((screen.getByLabelText('Modifier') as HTMLSelectElement).options).map(option => option.value)).toEqual(['expand', 'shell'])
    await user.click(screen.getByRole('button', { name: 'Add modifier' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '.35' } })
    expect(current().composition!.groups[0].modifiers).toEqual([{ type: 'expand', amount: .35 }])
    expect(parseSceneDocument(current())).toEqual(current())
    await user.click(within(section('Modifiers').closest('details')!).getByRole('button', { name: 'Add noise deformation' }))
    expect(current().composition!.groups[0].drivers).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Remove Expand modifier 1' }))
    expect(current().composition!.groups[0].modifiers).toEqual([])
    expect(current().composition!.groups[0].drivers).toEqual([])
    expect(parseSceneDocument(current())).toEqual(current())
  })
})
