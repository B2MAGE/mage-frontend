import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { buildApiUrl } from '@lib/api'
import {
  addTagFromSearch,
  mockCreateScenePageFetch,
  renderCreateScenePage,
  selectExistingTag,
  storeSceneEditorSession,
} from './test-fixtures'
import { screen } from '@testing-library/react'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()

  return {
    ...actual,
    MagePlayer: ({ sceneBlob }: { sceneBlob: unknown }) => (
      <div data-testid="mage-player">{sceneBlob ? 'preview-ready' : 'no-preview'}</div>
    ),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('CreateScenePage tags', () => {
  it('loads available tags and lets the user select more than one before saving', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await selectExistingTag(user, 'ambient')
    await selectExistingTag(user, 'focus-friendly')

    expect(screen.queryByLabelText(/create a new tag/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^selected tags$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ambient$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^focus-friendly$/i })).toBeInTheDocument()
  })

  it('creates a new tag in the editor and auto-selects it after success', async () => {
    storeSceneEditorSession()

    let createTagBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/tags')) {
        createTagBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(new Response(JSON.stringify({ tagId: 7, name: 'late night' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await addTagFromSearch(user, 'Late Night')

    expect(createTagBody).toEqual({ name: 'late night' })
    expect(screen.getByRole('button', { name: /^late night$/i })).toBeInTheDocument()
  })

  it('selects the existing tag when create-tag returns a duplicate-name conflict', async () => {
    storeSceneEditorSession()
    let tagFetchCount = 0

    mockCreateScenePageFetch((input, init) => {
      const method =
        typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'

      if (input === buildApiUrl('/tags') && method === 'GET') {
        tagFetchCount += 1

        return Promise.resolve(
          new Response(
            JSON.stringify([
              { tagId: 1, name: 'ambient' },
              { tagId: 2, name: 'focus-friendly' },
              ...(tagFetchCount > 1 ? [{ tagId: 3, name: 'late night' }] : []),
            ]),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
      }

      if (input === buildApiUrl('/tags')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'TAG_ALREADY_EXISTS',
              message: 'Tag already exists.',
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await addTagFromSearch(user, 'Late Night')

    expect(await screen.findByRole('button', { name: /^late night$/i })).toBeInTheDocument()
  })

  it('clicking a selected tag pill removes it from the scene', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await selectExistingTag(user, 'ambient')
    await user.click(screen.getByRole('button', { name: /^ambient$/i }))

    expect(screen.getByText(/no tags selected yet\./i)).toBeInTheDocument()
  })
})
