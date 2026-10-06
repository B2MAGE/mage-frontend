import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppThemeId } from '@theme'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import {
  buildSceneEditorApiScene,
  mockCreateScenePageFetch,
  renderCreateScenePage,
  renderEditScenePage,
  storeSceneEditorSession,
} from './test-fixtures'

const renderedPlayer = vi.fn()
let playerInstance = 0

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')

  return {
    ...actual,
    MagePlayer: (props: import('@modules/player').MagePlayerProps) => {
      const instance = React.useRef(++playerInstance)
      const { onPlaybackStatusChange } = props
      React.useEffect(() => {
        onPlaybackStatusChange?.('playing')
      }, [onPlaybackStatusChange])
      renderedPlayer(props)
      return <div data-instance={instance.current} data-testid="studio-player" />
    },
  }
})

beforeEach(() => {
  playerInstance = 0
  renderedPlayer.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function mockEditor(mode: 'create' | 'edit') {
  mockCreateScenePageFetch(input => mode === 'edit' && input === buildApiUrl('/scenes/12')
    ? jsonResponse(buildSceneEditorApiScene())
    : undefined)
}

describe('responsive Scene Studio frame', () => {
  it.each([
    ['create', 'mage-pulse'],
    ['create', 'classic-facebook'],
    ['edit', 'mage-pulse'],
    ['edit', 'classic-facebook'],
  ] as const)('renders the seven-step %s studio in the %s theme', async (mode, theme) => {
    storeSceneEditorSession()
    mockEditor(mode)

    if (mode === 'create') renderCreateScenePage(theme as AppThemeId)
    else renderEditScenePage(undefined, theme as AppThemeId)

    const pageTitle = await screen.findByRole('heading', {
      name: mode === 'create' ? 'Create a scene' : 'Edit your scene',
    })
    const layout = pageTitle.closest('.scene-editor-page')?.querySelector('.scene-editor-layout')
    const navigation = screen.getByRole('navigation', { name: 'Section navigation' })

    expect(layout).toBeInTheDocument()
    expect(within(navigation).getAllByRole('button')).toHaveLength(7)
    expect(screen.getByRole('heading', { name: 'Live Preview' })).toBeInTheDocument()
    expect(screen.queryByText('Live', { selector: '.scene-editor-preview__live-label' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh preview' })).not.toBeInTheDocument()
    expect(await screen.findByTitle('Preview playing')).toHaveAttribute('data-status', 'playing')
    expect(screen.getByRole('button', { name: 'Hide preview' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('studio-player')).toBeInTheDocument()
  })

  it('reports live step state and supports directional keyboard navigation', async () => {
    storeSceneEditorSession()
    mockEditor('create')
    renderCreateScenePage('mage-pulse')
    const user = userEvent.setup()
    const navigation = screen.getByRole('navigation', { name: 'Section navigation' })
    const details = within(navigation).getByRole('button', { name: 'Details' })
    const scene = within(navigation).getByRole('button', { name: 'Scene' })
    const confirm = within(navigation).getByRole('button', { name: 'Confirm' })

    expect(details).toHaveAttribute('aria-current', 'step')
    expect(details).toHaveAttribute('data-step-status', 'current')
    expect(document.getElementById(details.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'Current step. Needs attention: Scene name is required.',
    )
    expect(scene).toHaveAttribute('data-step-status', 'not-yet-complete')
    expect(confirm).toHaveAttribute('data-step-status', 'not-yet-complete')

    details.focus()
    await user.keyboard('{ArrowRight}')

    expect(scene).toHaveFocus()
    expect(scene).toHaveAttribute('aria-current', 'step')
    expect(details).toHaveAttribute('data-step-status', 'warning')
    expect(screen.getByRole('heading', { name: 'Choose the visual foundation.' })).toBeInTheDocument()
  })

  it('hides the preview without resetting draft, step, or player state and reports player status', async () => {
    storeSceneEditorSession()
    mockEditor('create')
    renderCreateScenePage('mage-pulse')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Scene Name'), 'Kept draft')
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const player = screen.getByTestId('studio-player')
    const playerInstanceBefore = player.getAttribute('data-instance')
    expect(screen.getByRole('button', { name: 'Scene' })).toHaveAttribute('aria-current', 'step')

    await waitFor(() => expect(screen.getByTitle('Preview playing')).toHaveAttribute('data-status', 'playing'))
    act(() => renderedPlayer.mock.lastCall?.[0].onPlaybackStatusChange?.('paused'))
    expect(screen.getByTitle('Preview paused')).toHaveAttribute('data-status', 'paused')
    act(() => renderedPlayer.mock.lastCall?.[0].onPlaybackStatusChange?.('unavailable'))
    expect(screen.getByTitle('Preview unavailable')).toHaveAttribute('data-status', 'unavailable')

    await user.click(screen.getByRole('button', { name: 'Hide preview' }))
    const layout = document.querySelector('.scene-editor-layout')
    expect(layout).toHaveClass('scene-editor-layout--preview-hidden')
    expect(screen.getByTestId('studio-player')).toHaveAttribute('data-instance', playerInstanceBefore)

    const restore = document.querySelector<HTMLButtonElement>('.scene-editor-preview-restore')
    expect(restore).toHaveAttribute('aria-expanded', 'false')
    await user.click(restore!)
    expect(layout).not.toHaveClass('scene-editor-layout--preview-hidden')
    expect(screen.getByTestId('studio-player')).toHaveAttribute('data-instance', playerInstanceBefore)

    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText('Scene Name')).toHaveValue('Kept draft')
  })
})
