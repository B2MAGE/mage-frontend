import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockCreateScenePageFetch, renderCreateScenePage, storeSceneEditorSession } from './test-fixtures'
import { parseSceneDraftRecord, sceneDraftStorageKey } from './sceneDraftRecovery'

vi.mock('@modules/player', async original => ({
  ...await original<typeof import('@modules/player')>(),
  MagePlayer: (props: import('@modules/player').MagePlayerProps) => <div data-testid="draft-preview" data-scene={JSON.stringify(props.sceneBlob)} />,
}))
vi.mock('@modules/player/availability/sceneAvailability', async () => ({
  sceneAvailabilityStore: (await import('@shared/test/sceneAvailability')).allowedSceneAvailability,
}))

beforeEach(() => { storeSceneEditorSession(); mockCreateScenePageFetch() })
const preview = () => JSON.parse(screen.getByTestId('draft-preview').getAttribute('data-scene')!)

describe('draft editing through the shared editor', () => {
  it.each(['mage-pulse', 'classic-facebook'] as const)('supports keyboard undo, redo, reorder and reversible reset in %s', async theme => {
    const user = userEvent.setup()
    renderCreateScenePage(theme)
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await waitFor(() => expect(preview().objects).toHaveLength(2))
    const selectedName = screen.getByLabelText('Name') as HTMLInputElement
    expect(selectedName.value).toBe('Sphere 2')
    await user.click(screen.getByRole('button', { name: 'Move up' }))
    await waitFor(() => expect(preview().objects.map((object: { id: string }) => object.id)).toEqual(['object-2', 'object-1']))
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(() => expect(preview().objects.map((object: { id: string }) => object.id)).toEqual(['object-1', 'object-2']))
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await waitFor(() => expect(preview().objects.map((object: { id: string }) => object.id)).toEqual(['object-2', 'object-1']))

    await user.type(screen.getByLabelText('Name'), 'xy')
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')
    await user.type(screen.getByLabelText('Name'), 'ab')
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')

    await user.click(screen.getByRole('button', { name: 'Object options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }))
    await waitFor(() => expect(preview().objects).toHaveLength(1))
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 1')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview().objects).toHaveLength(2))
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')
    const beforeReset = preview()
    await user.click(screen.getByRole('button', { name: 'Reset draft' }))
    await waitFor(() => expect(preview().kind).toBe('template'))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(beforeReset))
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')
  })

  it('offers a persisted draft after reopening and restores its selected object and details explicitly', async () => {
    const user = userEvent.setup()
    const editor = renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Unfinished constellation' } })
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await waitFor(() => expect(preview().objects).toHaveLength(2))
    const savedDraft = preview()
    editor.unmount()
    const persisted = localStorage.getItem(sceneDraftStorageKey(8, null))
    expect(persisted).not.toBeNull()
    expect(parseSceneDraftRecord(persisted!)?.snapshot.name).toBe('Unfinished constellation')

    renderCreateScenePage()
    await screen.findByRole('button', { name: 'Restore draft' })
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Restore draft' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Unfinished constellation')
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await waitFor(() => expect(preview()).toEqual(savedDraft))
    expect(screen.getByLabelText('Name')).toHaveValue('Sphere 2')
    const objects = screen.getByRole('group', { name: 'Scene objects' })
    expect(within(objects).getByRole('button', { name: /Sphere 2, Sphere/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Restore draft' })).not.toBeInTheDocument()
  })
})
