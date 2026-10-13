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
  it('opens a Spin calculation without rewriting it and permits other numeric targets in combined controls', async () => {
    const object = createBuilderScene().objects[0]
    object.drivers = [defaultDriverPreset(object, 'spin').driver]
    const original = structuredClone(object)
    const user = userEvent.setup(), onChange = vi.fn()
    render(<BuilderDriverControls node={object} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Expand Spin influence 1' }))
    await user.click(screen.getByRole('button', { name: 'Edit combined inputs' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('Property'), 'operation.radius')
    expect(onChange.mock.calls[0][0](object).drivers[0]).toEqual({ ...original.drivers![0], target: 'operation.radius' })
    expect(object).toEqual(original)
  })

  it('uses full motion by default and releases a custom cap without resetting the animation or losing undo', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
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
    expect(screen.getByLabelText('Pattern frequency numeric value')).toHaveValue(5.45)
    await user.click(screen.getByRole('button', { name: 'Follow audio signal' }))
    const next = onChange.mock.calls[0][0](object)
    expect(readDriverPreset(next.drivers[0].expression)).toMatchObject({ preset: 'pulse', source, amount: 2.45,
      offset: -.2, audioDriven: true, ...DRIVER_INFLUENCE_RANGE })
    expect({ ...next.drivers[0], expression: null }).toEqual({ ...driver, expression: null })
    expect(object.drivers[0].expression).toEqual(oldExpression)
  })

  it('preserves Alloy scene settings, edits combined group inputs, and undoes back to the original template', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    fireEvent.change(screen.getByLabelText('Scene Scale numeric value'), { target: { value: '23.5' } })
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    fireEvent.change(screen.getByLabelText('Animation speed'), { target: { value: '1.7' } })
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: [{ id: 'recipe-0-frame' }, { id: 'recipe-0-sphere' }, { id: 'recipe-0-solid-frame' }], parameters: { scale: 23.5, speed: 1.7 } }))
    const template = preview()
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    await screen.findByRole('heading', { name: 'Selected group' })
    await waitFor(() => expect(preview().objects.map((object: { operation: { type: string } }) => object.operation.type)).toEqual(['cylinder', 'sphere', 'sphere']))
    const builder = preview()
    expect(builder.objects.map((object: { operation: { type: string } }) => object.operation.type)).toEqual(['cylinder', 'sphere', 'sphere'])
    expect(builder.parameters).toEqual({ ...template.parameters, scale: 10 })
    expect(builder.settings).toEqual(template.settings)
    expect(builder.rendering).toEqual({ maxIterations: 56, stepSize: .7 })
    expect(screen.getByLabelText('Name')).toHaveValue('Shared motion')
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Combined inputs influence 1' }))
    const property = screen.getByLabelText('Property')
    expect(property).toHaveValue('rotation.x')
    expect(within(property).getByRole('option', { name: 'Overall scale' })).toBeInTheDocument()
    expect(screen.getByText(/open each value to edit it/i)).toBeVisible()
    await user.selectOptions(property, 'rotation.z')
    await waitFor(() => expect(preview().composition.groups[0].drivers[0]).toEqual({
      ...builder.composition.groups[0].drivers[0], target: 'rotation.z',
    }))
    expect(preview().parameters).toEqual(builder.parameters)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(builder))
    expect(screen.getByLabelText('Property')).toHaveValue('rotation.x')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(template))
  }, 30_000)

  it('keeps invalid ranges editable and retains the last valid preview until repaired', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
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
    await user.click(screen.getByRole('button', { name: 'Expand Follow input influence 1' }))
    expect(screen.getByLabelText('Property')).toHaveValue('operation.radius')
    expect(screen.getByLabelText('Input')).toHaveValue('time')
    expect(screen.getByLabelText('Amount numeric value')).toHaveValue(.25)
    expect(screen.getByLabelText('Offset numeric value')).toHaveValue(1)
    expect(screen.queryByText('Rotation wraps naturally through full turns.')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Apply influence'), 'multiply')
    const update = onChange.mock.calls[0][0]
    expect(update(object).drivers[0]).toEqual({ ...object.drivers[0], mode: 'multiply' })
  })

  it('can cancel or undo replacing a Builder draft with an editable recipe', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
    await waitFor(() => expect(preview().objects).toEqual([expect.objectContaining({ id: 'object-1', operation: { type: 'sphere', radius: 1 } })]))
    const original = preview()
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getAllByRole('button').map(button => button.textContent))
      .toEqual(['Use Alloy Capsule', 'Cancel'])
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(preview()).toEqual(original)
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Use Alloy Capsule' }))
    await waitFor(() => expect(preview().objects.map((object: { operation: { type: string } }) => object.operation.type))
      .toEqual(['cylinder', 'sphere', 'sphere']))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(original))
  }, 30_000)
})
