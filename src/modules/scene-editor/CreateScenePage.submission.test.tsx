import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { buildApiUrl } from '@lib/api'
import {
  mockCreateScenePageFetch,
  renderCreateScenePage,
  selectExistingTag,
  storeSceneEditorSession,
} from './test-fixtures'

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

describe('CreateScenePage submission', () => {
  it('submits the structured scene data and converts degree controls back to radians', async () => {
    storeSceneEditorSession()

    let submittedBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        submittedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
    })

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.type(screen.getByLabelText(/scene name/i), 'Aurora Drift')
    await user.click(screen.getByRole('button', { name: /^camera$/i }))
    expect(screen.getByRole('heading', { name: /^camera$/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/camera orientation/i), {
      target: { value: '90' },
    })
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
    storeSceneEditorSession()

    let createBody: Record<string, unknown> | null = null
    const attachedTagIds: number[] = []

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        createBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (input === buildApiUrl('/scenes/18/tags')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { tagId?: number }

        if (typeof payload.tagId === 'number') {
          attachedTagIds.push(payload.tagId)
        }

        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18, tagId: payload.tagId }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
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
    storeSceneEditorSession()

    const attachCalls: number[] = []

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (input === buildApiUrl('/scenes/18/tags')) {
        const payload = JSON.parse(String(init?.body ?? '{}')) as { tagId?: number }

        if (typeof payload.tagId === 'number') {
          attachCalls.push(payload.tagId)
        }

        if (payload.tagId === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: 'TAG_ATTACH_FAILED',
                message: 'Tag attachment is unavailable right now.',
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          )
        }

        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18, tagId: payload.tagId }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
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
    storeSceneEditorSession()

    const uploadedFiles: File[] = []
    let presignBody: Record<string, unknown> | null = null
    let createBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/thumbnail/presign')) {
        presignBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(
          new Response(
            JSON.stringify({
              objectKey: 'scenes/pending/8/thumbnails/abc123.png',
              uploadUrl: 'https://upload.example.com/scenes/pending/8/thumbnails/abc123.png',
              method: 'PUT',
              headers: {
                'Content-Type': 'image/png',
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
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
        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
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
    storeSceneEditorSession()

    let createAttempted = false

    mockCreateScenePageFetch((input) => {
      if (input === buildApiUrl('/scenes/thumbnail/presign')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'THUMBNAIL_STORAGE_UNAVAILABLE',
              message: 'Thumbnail storage is unavailable right now.',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
      }

      if (input === buildApiUrl('/scenes')) {
        createAttempted = true
        return Promise.resolve(
          new Response(JSON.stringify({ sceneId: 18 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
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
})
