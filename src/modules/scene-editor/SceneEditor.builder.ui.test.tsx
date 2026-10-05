import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createBuilderScene } from './builderEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

const renderedPlayer = vi.fn()
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) => {
    renderedPlayer(props)
    return <div data-testid="builder-preview" data-scene={JSON.stringify(props.sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { renderedPlayer.mockClear(); storeSceneEditorSession(); mockCreateScenePageFetch() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const preview = () => JSON.parse(screen.getByTestId('builder-preview').getAttribute('data-scene')!)

describe('Scene Builder object editor', () => {
  it('converts a template starting point and edits objects without hiding scene-wide controls', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))

    expect(preview()).toMatchObject({ kind: 'builder', objects: [{ id: 'object-1', operation: { type: 'sphere' } }] })
    expect(screen.getByRole('button', { name: 'Builder' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Custom Shader')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Shape', { selector: '#builder-add-shape' }), 'box')
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    const objectList = screen.getByRole('group', { name: 'Scene objects' })
    expect(within(objectList).getAllByRole('button')).toHaveLength(2)
    await user.click(within(objectList).getByRole('button', { name: /Box 2, Box/ }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Backdrop')
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })

    expect(preview().objects[1]).toMatchObject({
      id: 'object-2', name: 'Backdrop', operation: { type: 'box', width: 3 },
      transform: { position: { x: 4 } }, material: { color: '#112233' },
    })
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(preview().objects.map((object: { id: string }) => object.id)).toEqual(['object-1', 'object-2', 'object-3'])
    expect(within(screen.getByRole('group', { name: 'Scene objects' })).getByRole('button', { name: /^Backdrop, Box$/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByLabelText('Camera Position X'), { target: { value: '8' } })
    expect(preview()).toMatchObject({ kind: 'builder', settings: { controls: { position0: { x: 8 } } } })
  })

  it('opens a saved Builder document directly and retains it in raw JSON', async () => {
    const user = userEvent.setup()
    const document = createBuilderScene('reaction-rings-v1')
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: document })) : undefined)
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByText('Sphere 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    expect(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)).toEqual(document)
  })
})
