import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { addBuilderObject, createBuilderScene } from './builderEditor'
import { groupBuilderNodes, updateBuilderGroup } from './builderGroups'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('@modules/player', async original => ({ ...await original<typeof import('@modules/player')>(),
  MagePlayer: (props: import('@modules/player').MagePlayerProps) => <div data-testid="binding-preview" data-scene={JSON.stringify(props.sceneBlob)} />,
}))
vi.mock('@modules/player/availability/sceneAvailability', async () => ({
  sceneAvailabilityStore: (await import('@shared/test/sceneAvailability')).allowedSceneAvailability,
}))
beforeEach(() => {
  storeSceneEditorSession(); mockCreateScenePageFetch()
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn() })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('binding-preview').getAttribute('data-scene')!)
const openBindings = () => screen.getByRole('heading', { name: 'Music & pointer', level: 4 }).closest('summary')!

describe('Builder music and pointer inspector', () => {
  it.each(['mage-pulse', 'classic-facebook'] as const)('edits independent object/property responses in %s through shared themed controls', async theme => {
    const user = userEvent.setup()
    renderCreateScenePage(theme)
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
    await user.click(openBindings())
    await user.click(screen.getByRole('button', { name: 'Add response' }))
    await user.selectOptions(screen.getByLabelText('Source'), 'bass-hit')
    fireEvent.change(screen.getByLabelText('Strength numeric value'), { target: { value: '-.5' } })
    fireEvent.change(screen.getByLabelText('Offset numeric value'), { target: { value: '.2' } })
    expect(screen.getByText('Result range: 0.7× to 1.2×.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add response' }))
    await user.selectOptions(screen.getByLabelText('Property'), 'position.y')
    await user.selectOptions(screen.getByLabelText('Source'), 'pointer-y')
    expect(screen.getByRole('option', { name: 'Width (scale X)' })).toBeDisabled()
    await waitFor(() => expect(preview().objects[0].bindings).toMatchObject([
      { target: 'scale.x', source: 'bass-hit', amount: -.5, offset: .2 },
      { target: 'position.y', source: 'pointer-y' },
    ]))
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await user.click(openBindings())
    await user.click(screen.getByRole('button', { name: 'Add response' }))
    await user.selectOptions(screen.getByLabelText('Source'), 'treble-level')
    await waitFor(() => expect(preview().objects[1].bindings[0].source).toBe('treble-level'))
    expect(preview().objects[0].bindings[0].source).toBe('bass-hit')
    const beforeRemove = preview()
    await user.click(screen.getByRole('button', { name: 'Remove Width (scale X) response' }))
    await waitFor(() => expect(preview().objects[1].bindings).toHaveLength(0))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(beforeRemove))
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.getByRole('option', { name: 'Version 1 — Original' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Version 2 — Selective' })).toBeInTheDocument()
  }, 60_000)

  it('keeps invalid timing visible for repair, limits response count, and explains overridden materials', async () => {
    let builder = groupBuilderNodes(addBuilderObject(createBuilderScene(), 'box'), ['object-1', 'object-2'], 'group-1')
    builder = updateBuilderGroup(builder, 'group-1', group => ({ ...group, material: { color: '#112233', metalness: 0, shininess: .5 } }))
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: builder })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Sphere 1, Sphere' }))
    await user.click(openBindings())
    await user.click(screen.getByRole('button', { name: 'Add response' }))
    await user.selectOptions(screen.getByLabelText('Property'), 'material.metalness')
    await user.selectOptions(screen.getByLabelText('Source'), 'pointer-down')
    expect(screen.getByText(/Group 1 supplies this object's visible material/)).toBeVisible()
    await waitFor(() => expect(preview().objects[0].bindings[0].target).toBe('material.metalness'))
    const valid = preview()
    const release = screen.getByLabelText('Fall time (seconds)')
    fireEvent.change(release, { target: { value: '9' } })
    expect(release).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(release.getAttribute('aria-describedby')!)).toHaveTextContent(/5|maximum/)
    expect(preview()).toEqual(valid)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Fall time (seconds)')).toBeVisible()
    expect(screen.getByLabelText('Fall time (seconds)')).toHaveValue(9)
    fireEvent.change(screen.getByLabelText('Fall time (seconds)'), { target: { value: '.4' } })
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole('button', { name: 'Add response' }))
    expect(screen.getByRole('button', { name: 'Add response' })).toBeDisabled()
    await waitFor(() => expect(preview().objects[0].bindings).toHaveLength(4))
  }, 60_000)
})
