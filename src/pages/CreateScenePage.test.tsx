import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
} from '../auth/AuthContext'
import { buildApiUrl } from '../lib/api'
import { CreateScenePage } from './CreateScenePage'

vi.mock('../components/MagePlayer', () => ({
  MagePlayer: ({ sceneBlob }: { sceneBlob: unknown }) => (
    <div data-testid="mage-player">{sceneBlob ? 'preview-ready' : 'no-preview'}</div>
  ),
}))

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Scene Artist',
  authProvider: 'LOCAL',
}

const mockTags = [
  { tagId: 1, name: 'ambient' },
  { tagId: 2, name: 'focus-friendly' },
]

type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Response | Promise<Response> | null | undefined

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function storeSession() {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'stored-auth-token',
      user: storedUser,
    }),
  )
}

function mockCreateScenePageFetch(
  handler?: FetchHandler,
  tagsResponse: unknown[] = mockTags,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method = typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'

    if (input === buildApiUrl('/users/me')) {
      return Promise.resolve(jsonResponse(storedUser))
    }

    if (input === buildApiUrl('/tags') && method === 'GET') {
      return Promise.resolve(jsonResponse(tagsResponse))
    }

    const nextResponse = handler?.(input, init)

    if (nextResponse) {
      return Promise.resolve(nextResponse)
    }

    throw new Error(`Unexpected request: ${String(input)}`)
  })
}

function renderCreateScenePage() {
  return render(
    <MemoryRouter initialEntries={['/create-scene']}>
      <AuthProvider>
        <Routes>
          <Route path="/create-scene" element={<CreateScenePage />} />
          <Route path="/my-scenes" element={<div>My Scenes</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function selectExistingTag(user: ReturnType<typeof userEvent.setup>, tagName: string) {
  const searchInput = await screen.findByLabelText(/select existing tags/i)

  await user.click(searchInput)
  await user.clear(searchInput)
  await user.type(searchInput, tagName)
  await user.click(screen.getByRole('button', { name: new RegExp(`^${tagName}$`, 'i') }))
}

async function addTagFromSearch(user: ReturnType<typeof userEvent.setup>, tagName: string) {
  const normalizedTagName = tagName.trim().toLowerCase()
  const searchInput = await screen.findByLabelText(/select existing tags/i)

  await user.click(searchInput)
  await user.clear(searchInput)
  await user.type(searchInput, tagName)
  await user.click(
    screen.getByRole('button', {
      name: new RegExp(`^Add tag "${normalizedTagName}"$`, 'i'),
    }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('CreateScenePage', () => {
  it('renders the details step first while keeping the full section menu available', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    expect(screen.getByRole('heading', { name: /create scene/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /basic/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^scene$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^camera$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^motion$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^effects$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^details$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^scene$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /pass order/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /advanced/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('preview-ready')
  })

  it('renders interactive metadata controls beneath the scene name field', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'A soft drifting scene for night scenes.' },
    })
    fireEvent.change(screen.getByLabelText(/playlists/i), {
      target: { value: 'ambient-atlas' },
    })
    fireEvent.change(screen.getByLabelText(/upload thumbnail file/i), {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    })

    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'A soft drifting scene for night scenes.',
    )
    expect(screen.getByLabelText(/playlists/i)).toHaveValue('ambient-atlas')
    expect(screen.getByText(/selected file:/i)).toBeInTheDocument()
    expect(screen.getByText(/cover\.png/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /a\/b testing/i })).not.toBeInTheDocument()
  })

  it('keeps the first section ordered around scene metadata and shows sticky navigation actions', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    const nameField = screen.getByLabelText(/scene name/i)
    const descriptionField = screen.getByLabelText(/description/i)
    const playlistsField = screen.getByLabelText(/playlists/i)
    const thumbnailField = screen.getByLabelText(/upload thumbnail file/i)
    const tagSearchField = await screen.findByLabelText(/select existing tags/i)

    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(
      nameField.compareDocumentPosition(descriptionField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      descriptionField.compareDocumentPosition(playlistsField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      playlistsField.compareDocumentPosition(thumbnailField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      thumbnailField.compareDocumentPosition(tagSearchField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    expect(screen.getByRole('button', { name: /^back$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /create scene/i })).toBeInTheDocument()
  })

  it('loads available tags and lets the user select more than one before saving', async () => {
    storeSession()

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
    storeSession()

    let createTagBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/tags')) {
        createTagBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(jsonResponse({ tagId: 7, name: 'late night' }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await addTagFromSearch(user, 'Late Night')

    await waitFor(() => expect(screen.getByRole('button', { name: /^late night$/i })).toBeInTheDocument())

    expect(createTagBody).toMatchObject({
      name: 'late night',
    })
    expect(screen.getByRole('button', { name: /^late night$/i })).toBeInTheDocument()
  })

  it('selects the existing tag when create-tag returns a duplicate-name conflict', async () => {
    storeSession()

    let tagListRequestCount = 0

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation((input, init) => {
      const method = typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'

      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/tags') && method === 'GET') {
        tagListRequestCount += 1

        const tagList =
          tagListRequestCount === 1
            ? [
                { tagId: 1, name: 'ambient' },
                { tagId: 2, name: 'focus-friendly' },
              ]
            : [
                { tagId: 1, name: 'ambient' },
                { tagId: 2, name: 'focus-friendly' },
                { tagId: 7, name: 'late night' },
              ]

        return Promise.resolve(
          jsonResponse(tagList),
        )
      }

      if (input === buildApiUrl('/tags') && method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'TAG_ALREADY_EXISTS',
              message: 'A tag with this name already exists.',
            },
            409,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await addTagFromSearch(user, 'Late Night')

    await waitFor(() => expect(tagListRequestCount).toBeGreaterThanOrEqual(2))
    expect(screen.getByRole('button', { name: /^late night$/i })).toBeInTheDocument()
    expect(screen.queryByText(/failed to create tag/i)).not.toBeInTheDocument()
  })

  it('clicking a selected tag pill removes it from the scene', async () => {
    storeSession()

    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await selectExistingTag(user, 'ambient')
    await user.click(screen.getByRole('button', { name: /^ambient$/i }))

    expect(screen.getByText(/no tags selected yet\./i)).toBeInTheDocument()
  })

  it('keeps the Motion section focused on the persisted MAGE engine motion controls', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'motion' } })

    expect(screen.getByRole('heading', { name: /^motion$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/auto rotate/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time multiplier/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/audio gain/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/audio curve/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pointer release hold/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/base speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/easing speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rotation speed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
  })

  it('moves between sections with the next and back buttons and keeps the menu in sync', async () => {
    storeSession()

    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    const sectionMenu = screen.getByLabelText(/jump to section/i)

    expect(sectionMenu).toHaveValue('details')

    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(screen.getByRole('heading', { name: /^scene$/i })).toBeInTheDocument()
    expect(sectionMenu).toHaveValue('scene')
    expect(screen.getByLabelText(/custom shader/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^back$/i }))

    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(sectionMenu).toHaveValue('details')
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
  })

  it('splits pass ordering into its own section and groups effects into categorized cards', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'effects' } })

    expect(screen.getByRole('heading', { name: /^effects$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^pass order$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^finish & output$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^channel & motion$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^color & tone$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^pattern & structure$/i })).toBeInTheDocument()
    expect(screen.getByText(/^gamma correction$/i)).toBeInTheDocument()
    expect(screen.getByText(/sharp digital breakups and instability/i)).toBeInTheDocument()
    expect(screen.queryByText(/^additional passes$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^output pass$/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'pass-order' } })

    expect(screen.getByRole('heading', { name: /^pass order$/i })).toBeInTheDocument()
    expect(screen.getByText(/^output$/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^finish & output$/i })).not.toBeInTheDocument()
  })

  it('submits the structured scene data and converts degree controls back to radians', async () => {
    storeSession()

    let submittedBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        submittedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(jsonResponse({ sceneId: 18 }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'camera' } })
    expect(screen.getByRole('heading', { name: /^camera$/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/camera orientation/i), { target: { value: '90' } })
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    await waitFor(() => expect(submittedBody).not.toBeNull())

    if (!submittedBody) {
      throw new Error('Expected scene submission payload to be captured.')
    }

    const responseBody: { name: string; sceneData: Record<string, unknown> } = submittedBody
    const sceneData = responseBody.sceneData
    const intent = sceneData.intent as Record<string, number>
    const fx = sceneData.fx as Record<string, unknown>
    const passOrder = fx.passOrder as string[]

    expect(responseBody).toMatchObject({
      name: 'Aurora Drift',
    })
    expect(intent.camTilt).toBeCloseTo(Math.PI / 2, 5)
    expect(passOrder.at(-1)).toBe('outputPass')
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('attaches selected tags after the scene is created', async () => {
    storeSession()

    let createBody: Record<string, unknown> | null = null
    const attachedTagIds: number[] = []

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        createBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(jsonResponse({ sceneId: 18 }, 201))
      }

      if (input === buildApiUrl('/scenes/18/tags')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { tagId?: number }

        if (typeof payload.tagId === 'number') {
          attachedTagIds.push(payload.tagId)
        }

        return Promise.resolve(jsonResponse({ sceneId: 18, tagId: payload.tagId }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    await selectExistingTag(user, 'ambient')
    await selectExistingTag(user, 'focus-friendly')
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    await screen.findByText('My Scenes')

    expect(createBody).toMatchObject({
      name: 'Aurora Drift',
    })
    expect(attachedTagIds).toEqual([1, 2])
  })

  it('keeps the created scene in retry mode when one or more tag attachments fail', async () => {
    storeSession()

    const attachCalls: number[] = []

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse({ sceneId: 18 }, 201))
      }

      if (input === buildApiUrl('/scenes/18/tags')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { tagId?: number }

        if (typeof payload.tagId === 'number') {
          attachCalls.push(payload.tagId)
        }

        if (payload.tagId === 2) {
          return Promise.resolve(
            jsonResponse(
              {
                code: 'TAG_ATTACH_FAILED',
                message: 'Tag attachment is unavailable right now.',
              },
              503,
            ),
          )
        }

        return Promise.resolve(jsonResponse({ sceneId: 18, tagId: payload.tagId }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    await selectExistingTag(user, 'ambient')
    await selectExistingTag(user, 'focus-friendly')
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    expect(
      await screen.findByText(/scene created, but we couldn't attach focus-friendly\./i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry tag attachment/i })).toBeInTheDocument()
    expect(screen.getByText(/waiting to retry attachment for:/i)).toBeInTheDocument()
    expect(attachCalls).toEqual([1, 2])
  })

  it('uploads a selected thumbnail before the scene create request is sent', async () => {
    storeSession()

    const uploadedFiles: File[] = []
    let presignBody: Record<string, unknown> | null = null
    let createBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/thumbnail/presign')) {
        presignBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(
          jsonResponse({
            objectKey: 'scenes/pending/8/thumbnails/abc123.png',
            uploadUrl: 'https://upload.example.com/scenes/pending/8/thumbnails/abc123.png',
            method: 'PUT',
            headers: {
              'Content-Type': 'image/png',
            },
          }),
        )
      }

      if (input === 'https://upload.example.com/scenes/pending/8/thumbnails/abc123.png') {
        if (init?.body instanceof File) {
          uploadedFiles.push(init.body)
        }

        return Promise.resolve(new Response(null, { status: 200 }))
      }

      if (input === buildApiUrl('/scenes')) {
        createBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(jsonResponse({ sceneId: 18 }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    fireEvent.change(screen.getByLabelText(/upload thumbnail file/i), {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    })
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    await waitFor(() => expect(presignBody).not.toBeNull())

    expect(presignBody).toMatchObject({
      filename: 'cover.png',
      contentType: 'image/png',
      sizeBytes: 5,
    })
    expect(uploadedFiles).toHaveLength(1)
    expect(uploadedFiles[0].name).toBe('cover.png')
    expect(createBody).toMatchObject({
      name: 'Aurora Drift',
      thumbnailObjectKey: 'scenes/pending/8/thumbnails/abc123.png',
    })
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('does not create the scene when thumbnail upload preparation fails', async () => {
    storeSession()

    let createAttempted = false

    mockCreateScenePageFetch((input) => {
      if (input === buildApiUrl('/scenes/thumbnail/presign')) {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'THUMBNAIL_STORAGE_UNAVAILABLE',
              message: 'Thumbnail storage is unavailable right now.',
            },
            503,
          ),
        )
      }

      if (input === buildApiUrl('/scenes')) {
        createAttempted = true
        return Promise.resolve(jsonResponse({ sceneId: 18 }, 201))
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    fireEvent.change(screen.getByLabelText(/upload thumbnail file/i), {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    })
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    expect(
      await screen.findByText(/thumbnail storage is unavailable right now\./i),
    ).toBeInTheDocument()
    expect(createAttempted).toBe(false)
  })

  it('surfaces advanced MAGE engine fields and the raw JSON editor in the Advanced section', async () => {
    storeSession()

    mockCreateScenePageFetch()

    renderCreateScenePage()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'advanced' } })

    expect(screen.getByRole('heading', { name: /^advanced$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/camera orientation mode/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/camera orientation speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/scene data json/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /format json/i })).toBeInTheDocument()
  })
})
