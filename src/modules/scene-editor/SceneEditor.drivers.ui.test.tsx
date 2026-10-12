import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCreateScenePageFetch, renderCreateScenePage, storeSceneEditorSession } from './test-fixtures'
import { createBuilderScene } from './builderEditor'
import { BuilderDriverControls } from './ui/BuilderDriverControls'
import { createDriverPresetExpression, defaultDriverPreset, DRIVER_INFLUENCE_RANGE, readDriverPreset } from './builderDrivers'

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
  it('uses full motion by default and releases a custom cap without resetting the animation or losing undo', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Add pulse' }))
    expect(screen.getByLabelText('Influence limits')).toHaveValue('full')
    expect(screen.queryByLabelText('Maximum influence')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Input'), 'bass-hit')
    expect(screen.queryByLabelText('Speed numeric value')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Phase numeric value')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Amount numeric value'), { target: { value: '5.55' } })
    await waitFor(() => expect(readDriverPreset(preview().objects[0].drivers[0].expression)).toMatchObject({ amount: 5.55, source: 'bass-hit', ...DRIVER_INFLUENCE_RANGE }))
    await user.selectOptions(screen.getByLabelText('Influence limits'), 'custom')
    await waitFor(() => expect(preview().objects[0].drivers[0].expression.max).toBe(1))
    // An intentionally authored cap survives Amount edits until explicitly released.
    fireEvent.change(screen.getByLabelText('Amount numeric value'), { target: { value: '5.65' } })
    await waitFor(() => expect(readDriverPreset(preview().objects[0].drivers[0].expression)).toMatchObject({ amount: 5.65, minimum: -1, maximum: 1 }))
    const capped = preview()
    await user.selectOptions(screen.getByLabelText('Influence limits'), 'full')
    await waitFor(() => expect(readDriverPreset(preview().objects[0].drivers[0].expression)).toMatchObject({ amount: 5.65, source: 'bass-hit', ...DRIVER_INFLUENCE_RANGE }))
    expect({ ...preview().objects[0], drivers: [] }).toEqual({ ...capped.objects[0], drivers: [] })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(capped))
    expect(screen.getByLabelText('Influence limits')).toHaveValue('custom')
  }, 30_000)

  it.each(['bass-hit', 'bass-level', 'mid-level', 'treble-level', 'overall-level'])('converts an existing input-phase Pulse to %s response without changing its strength or limits', async source => {
    const object = createBuilderScene().objects[0]
    const { driver, values } = defaultDriverPreset(object, 'pulse')
    // Existing saved expressions use the same cosine wave for Time and hits.
    const oldWave = createDriverPresetExpression({ ...values, source: 'time', speed: 5.45, phase: .116, amount: 2.45, offset: -.2 })
    const oldExpression = JSON.parse(JSON.stringify(oldWave).replace('"source":"time"', `"source":"${source}"`))
    object.drivers = [{ ...driver, expression: oldExpression }]
    const user = userEvent.setup(), onChange = vi.fn()
    render(<BuilderDriverControls node={object} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Expand Pulse influence 1' }))
    expect(screen.getByLabelText('Speed numeric value')).toHaveValue(5.45)
    await user.click(screen.getByRole('button', { name: 'Follow audio signal' }))
    const next = onChange.mock.calls[0][0](object)
    expect(readDriverPreset(next.drivers[0].expression)).toMatchObject({ preset: 'pulse', source, amount: 2.45,
      offset: -.2, audioDriven: true, ...DRIVER_INFLUENCE_RANGE })
    expect({ ...next.drivers[0], expression: null }).toEqual({ ...driver, expression: null })
    expect(object.drivers[0].expression).toEqual(oldExpression)
  })

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
    await user.selectOptions(screen.getByLabelText('Influence limits'), 'custom')
    await waitFor(() => expect(preview().objects[0].drivers[0].expression.max).toBe(1))
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
