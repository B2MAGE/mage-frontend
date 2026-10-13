import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { addBuilderObject, createBuilderScene } from './builderEditor'
import { groupBuilderNodes } from './builderGroups'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('@modules/player', async original => ({ ...await original<typeof import('@modules/player')>(),
  MagePlayer: (props: import('@modules/player').MagePlayerProps) => <div data-testid="group-preview" data-scene={JSON.stringify(props.sceneBlob)} />,
}))
vi.mock('@modules/player/availability/sceneAvailability', async () => ({
  sceneAvailabilityStore: (await import('@shared/test/sceneAvailability')).allowedSceneAvailability,
}))
beforeEach(() => {
  storeSceneEditorSession(); mockCreateScenePageFetch()
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn() })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('group-preview').getAttribute('data-scene')!)

describe('Builder group controls', () => {
  it('groups checked rows, edits their shared transform/join/material, and undoes ungrouping', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await user.click(screen.getByRole('checkbox', { name: 'Include Sphere 1 in group selection' }))
    await user.click(screen.getByRole('checkbox', { name: 'Include Sphere 2 in group selection' }))
    await user.click(screen.getByRole('button', { name: 'Group selected (2)' }))
    expect(screen.getByRole('heading', { name: 'Selected group' })).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('Group 1')
    expect(screen.getByRole('button', { name: 'Group 1, Group' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('heading', { name: 'Composition', level: 4 }).closest('summary')!)
    await user.selectOptions(screen.getByLabelText('Join surfaces'), 'smooth-union')
    fireEvent.change(screen.getByLabelText('Blend radius numeric value'), { target: { value: '.6' } })
    await user.click(screen.getByRole('heading', { name: 'Transform', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Position transform' }))
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '2' } })
    await user.click(screen.getByRole('heading', { name: 'Appearance', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('checkbox', { name: 'Use one material for this group' }))
    await waitFor(() => expect(preview().composition.groups[0]).toMatchObject({
      transform: { position: { x: 2 } }, operation: { type: 'smooth-union', blend: .6 }, material: { color: '#8066ff' },
    }))
    const beforeUngroup = preview()
    await user.click(screen.getByRole('button', { name: 'Object options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ungroup' }))
    await waitFor(() => expect(preview().composition.groups).toHaveLength(0))
    expect(screen.getByRole('heading', { name: 'Selected object' })).toBeVisible()
    expect(preview().objects[0].frame.position.x).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(beforeUngroup))
    expect(screen.getByLabelText('Name')).toHaveValue('Group 1')
  }, 60_000)

  it('shows imported group transform errors in the group inspector and retains the last valid preview', async () => {
    const builder = groupBuilderNodes(addBuilderObject(createBuilderScene(), 'box'), ['object-1', 'object-2'], 'group-1')
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: builder })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('heading', { name: 'Transform', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Scale transform' }))
    const before = preview()
    const scale = screen.getByLabelText('Scale numeric value')
    fireEvent.change(scale, { target: { value: '25' } })
    expect(scale).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(scale.getAttribute('aria-describedby')!)).toHaveTextContent(/20|maximum/)
    expect(preview()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Scale numeric value')).toHaveValue(25)
    expect(screen.getByLabelText('Scale numeric value')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Scale numeric value'), { target: { value: '2' } })
    await waitFor(() => expect(preview().composition.groups[0].transform.scale).toBe(2))
  }, 60_000)
})
