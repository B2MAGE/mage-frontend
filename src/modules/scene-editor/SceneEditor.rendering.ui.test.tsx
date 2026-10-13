import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createBuilderScene } from './builderEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) =>
    <div data-testid="rendering-preview" data-scene={JSON.stringify(props.sceneBlob)} /> }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
beforeEach(() => { storeSceneEditorSession(); mockCreateScenePageFetch() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('rendering-preview').getAttribute('data-scene')!)
const openRendering = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('heading', { name: 'Rendering', level: 4 }).closest('summary')!)
}

describe('Builder rendering controls', () => {
  it('shows existing defaults and makes rendering edits undoable without changing objects', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
    await waitFor(() => expect(preview().objects).toEqual(createBuilderScene().objects))
    const original = preview()
    expect(original).not.toHaveProperty('rendering')
    await openRendering(user)
    expect(screen.getByLabelText('Maximum steps numeric value')).toHaveValue(96)
    expect(screen.getByLabelText('Step size numeric value')).toHaveValue(.7)
    fireEvent.change(screen.getByLabelText('Maximum steps numeric value'), { target: { value: '151' } })
    await waitFor(() => expect(preview().rendering).toEqual({ maxIterations: 151, stepSize: .7 }))
    expect(preview().objects).toEqual(original.objects)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(original))
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview().rendering.maxIterations).toBe(151))
  })

  it('retains a reopened precise profile and rejects invalid edits without replacing the working preview', async () => {
    const builder = createBuilderScene()
    builder.rendering = { maxIterations: 198, stepSize: .8838993805155669 }
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: builder })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await openRendering(user)
    expect(screen.getByLabelText('Step size numeric value')).toHaveValue(builder.rendering.stepSize)
    expect(screen.getByLabelText('Step size numeric value')).toHaveAttribute('step', 'any')
    const valid = preview()
    fireEvent.change(screen.getByLabelText('Maximum steps numeric value'), { target: { value: '201' } })
    expect(screen.getByLabelText('Maximum steps numeric value')).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toEqual(valid)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Maximum steps numeric value')).toBeVisible()
    expect(screen.getByLabelText('Maximum steps numeric value')).toHaveValue(201)
    fireEvent.change(screen.getByLabelText('Maximum steps numeric value'), { target: { value: '198' } })
    fireEvent.change(screen.getByLabelText('Step size numeric value'), { target: { value: '.004' } })
    expect(screen.getByLabelText('Step size numeric value')).toHaveAttribute('aria-invalid', 'true')
    expect(preview()).toEqual(valid)
    fireEvent.change(screen.getByLabelText('Step size numeric value'), { target: { value: '.26597607104610804' } })
    await waitFor(() => expect(preview().rendering).toEqual({ maxIterations: 198, stepSize: .26597607104610804 }))
  })
})
