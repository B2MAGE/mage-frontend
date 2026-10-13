import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCreateScenePageFetch, renderCreateScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) =>
    <div data-testid="lattice-preview" data-scene={JSON.stringify(props.sceneBlob)} /> }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
beforeEach(() => { storeSceneEditorSession(); mockCreateScenePageFetch() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('lattice-preview').getAttribute('data-scene')!)

describe('Frame and lattice authoring', () => {
  it('edits fractional repetitions, retains rejected drafts, and offers only live lattice fields as animation targets', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))
    await user.selectOptions(screen.getByLabelText('Shape', { selector: '#builder-object-shape' }), 'lattice')
    await user.click(screen.getByRole('heading', { name: 'Size', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Repetition levels size' }))
    fireEvent.change(screen.getByLabelText('Repetition levels'), { target: { value: '1.99' } })
    await waitFor(() => expect(preview().objects[0].operation.iterations).toBe(1.99))
    const valid = preview()
    fireEvent.change(screen.getByLabelText('Repetition levels'), { target: { value: '6' } })
    expect(screen.getByLabelText('Repetition levels')).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toEqual(valid)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Repetition levels')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Repetition levels'), { target: { value: '1.99' } })
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Add pulse' }))
    const property = screen.getByLabelText('Property')
    expect(within(property).queryByRole('option', { name: 'Repetition levels' })).not.toBeInTheDocument()
    expect(within(property).getByRole('option', { name: 'Rod thickness' })).toBeInTheDocument()
    await user.selectOptions(property, 'operation.thickness')
    await waitFor(() => expect(preview().objects[0].drivers[0].target).toBe('operation.thickness'))
  })

  it('opens an editable frame recipe and allows rotation order to be changed and undone', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-1')
    await screen.findByRole('heading', { name: 'Selected group' })
    await waitFor(() => expect(preview().objects.map((object: { operation: { type: string } }) => object.operation.type))
      .toEqual(['lattice', 'box-frame', 'box-frame', 'box-frame']))
    await user.click(screen.getByRole('heading', { name: 'Transform', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Rotation transform' }))
    const initial = preview()
    await user.selectOptions(screen.getByLabelText('Rotation order'), 'zyx')
    await waitFor(() => expect(preview().composition.groups[0].transform.rotationOrder).toBe('zyx'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(initial))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: [{ id: 'recipe-0-frame' }, { id: 'recipe-0-sphere' }, { id: 'recipe-0-solid-frame' }] }))
  })
})
