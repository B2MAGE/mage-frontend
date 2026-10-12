import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCreateScenePageFetch, renderCreateScenePage, storeSceneEditorSession } from './test-fixtures'
import { createBuilderScene } from './builderEditor'
import { BuilderDriverControls } from './ui/BuilderDriverControls'

vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) =>
    <div data-testid="driver-preview" data-scene={JSON.stringify(props.sceneBlob)} /> }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { storeSceneEditorSession(); mockCreateScenePageFetch() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('driver-preview').getAttribute('data-scene')!)

describe('Builder property drivers and editable recipes', () => {
  it('opens Alloy as editable constituent objects, edits group animation, and can undo back to the original template', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    await user.click(screen.getByRole('button', { name: 'Customize in Builder' }))
    await screen.findByRole('heading', { name: 'Selected group' })
    await waitFor(() => expect(preview().kind).toBe('builder'))
    expect(preview().objects.map((object: { operation: { type: string } }) => object.operation.type)).toEqual(['cylinder', 'sphere', 'sphere'])
    expect(screen.getByLabelText('Name')).toHaveValue('Shared motion')
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Spin influence 1' }))
    const property = screen.getByLabelText('Property')
    expect(within(property).getAllByRole('option')).toHaveLength(3)
    expect(within(property).queryByRole('option', { name: 'Overall scale' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Speed numeric value'), { target: { value: '.4' } })
    await waitFor(() => expect(JSON.stringify(preview())).toContain('0.4'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview().composition.groups[0].drivers[0].expression.left.right.value).toBe(.1))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'template', templateId: 'embedded-scene-5' }))
  }, 30_000)

  it('keeps invalid ranges editable and retains the last valid preview until repaired', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Add pulse' }))
    await waitFor(() => expect(preview().objects[0].drivers).toHaveLength(1))
    await user.selectOptions(screen.getByLabelText('Property'), 'operation.radius')
    await waitFor(() => expect(preview().objects[0].drivers[0].target).toBe('operation.radius'))
    const valid = preview()
    fireEvent.change(screen.getByLabelText('Minimum influence'), { target: { value: '2' } })
    expect(screen.getByLabelText('Minimum influence')).toHaveValue(2)
    expect(screen.getByRole('alert')).toHaveTextContent(/minimum|clamp|range/i)
    expect(preview()).toEqual(valid)
    fireEvent.change(screen.getByLabelText('Minimum influence'), { target: { value: '-1' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Maximum influence'), { target: { value: '-2' } })
    expect(screen.getByLabelText('Maximum influence')).toHaveValue(-2)
    expect(preview()).toEqual(valid)
    fireEvent.change(screen.getByLabelText('Maximum influence'), { target: { value: '1' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Add follow input' }))
    await user.selectOptions(screen.getByLabelText('Property', { selector: '#builder-driver-1-target' }), 'operation.radius')
    await user.selectOptions(screen.getByLabelText('Apply influence', { selector: '#builder-driver-1-mode' }), 'multiply')
    await waitFor(() => expect(preview().objects[0].drivers[1].mode).toBe('multiply'))
    const ordered = preview().objects[0].drivers
    await user.click(screen.getByRole('button', { name: 'Move influence 2 earlier' }))
    await waitFor(() => expect(preview().objects[0].drivers).toEqual([ordered[1], ordered[0]]))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview().objects[0].drivers).toEqual(ordered))
  }, 30_000)

  it('preserves a valid imported linear time driver on a non-rotation property', async () => {
    const object = createBuilderScene().objects[0]
    object.drivers = [{ target: 'operation.radius', mode: 'add', expression: { type: 'add',
      left: { type: 'multiply', left: { type: 'input', source: 'time' }, right: { type: 'constant', value: .25 } },
      right: { type: 'constant', value: 1 } } }]
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<BuilderDriverControls node={object} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Expand Combined inputs influence 1' }))
    expect(screen.getByLabelText('Property')).toHaveValue('operation.radius')
    expect(screen.queryByText('Rotation wraps naturally through full turns.')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Apply influence'), 'multiply')
    const update = onChange.mock.calls[0][0]
    expect(update(object).drivers[0]).toEqual({ ...object.drivers[0], mode: 'multiply' })
  })

  it('offers palette application separately from replacing the document with an editable recipe', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))
    await waitFor(() => expect(preview().kind).toBe('builder'))
    const originalId = preview().objects[0].id
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'Customize in Builder' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Apply palette only' }))
    await waitFor(() => expect(preview().objects[0].material.color).toBe('#3d4437'))
    expect(preview().objects).toHaveLength(1)
    expect(preview().objects[0].id).toBe(originalId)
  }, 30_000)
})
