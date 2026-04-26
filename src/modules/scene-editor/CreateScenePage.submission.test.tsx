import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { buildApiUrl } from '@shared/lib'
import {
  mockCreateScenePageFetch,
  renderCreateScenePage,
  selectExistingTag,
  storeSceneEditorSession,
} from './test-fixtures'

const CAPTURED_THUMBNAIL_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+7sAAAAASUVORK5CYII='
const mockCaptureFramePreview = vi.fn(
  async (): Promise<string | null> => CAPTURED_THUMBNAIL_DATA_URL,
)

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')

  return {
    ...actual,
    MagePlayer: ({
      onCaptureFramePreviewChange,
      sceneBlob,
    }: {
      onCaptureFramePreviewChange?: (
        captureFramePreview: (() => Promise<string | null>) | null,
      ) => void
      sceneBlob: unknown
    }) => {
      React.useEffect(() => {
        onCaptureFramePreviewChange?.(
          sceneBlob ? () => mockCaptureFramePreview() : null,
        )

        return () => {
          onCaptureFramePreviewChange?.(null)
        }
      }, [onCaptureFramePreviewChange, sceneBlob])

      return (
        <div data-testid="mage-player">
          {sceneBlob ? 'preview-ready' : 'no-preview'}
        </div>
      )
    },
  }
})

beforeEach(() => {
  mockCaptureFramePreview.mockReset()
  mockCaptureFramePreview.mockResolvedValue(CAPTURED_THUMBNAIL_DATA_URL)
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
    await user.type(screen.getByLabelText(/description/i), 'Soft teal bloom with low-end drift.')
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
      description: 'Soft teal bloom with low-end drift.',
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

  it('captures a thumbnail automatically from the live preview before the scene create request is sent', async () => {
    storeSceneEditorSession()

    const uploadedFiles: File[] = []
    let presignBody:
      | {
          contentType: string
          filename: string
          sizeBytes: number
        }
      | null = null
    let createBody: Record<string, unknown> | null = null

    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/thumbnail/presign')) {
        presignBody = JSON.parse(String(init?.body ?? '{}')) as {
          contentType: string
          filename: string
          sizeBytes: number
        }
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
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    await waitFor(() => expect(presignBody).not.toBeNull())

    const capturedPresignBody = presignBody!

    expect(capturedPresignBody.filename).toBe('scene-preview-thumbnail.png')
    expect(capturedPresignBody.contentType).toBe('image/png')
    expect(capturedPresignBody.sizeBytes).toEqual(expect.any(Number))
    expect(capturedPresignBody.sizeBytes).toBeGreaterThan(0)
    expect(uploadedFiles).toHaveLength(1)
    expect(uploadedFiles[0].name).toBe('scene-preview-thumbnail.png')
    expect(createBody).toMatchObject({
      name: 'Aurora Drift',
      thumbnailObjectKey: 'scenes/pending/8/thumbnails/abc123.png',
    })
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('does not create the scene when automatic thumbnail capture fails during submit', async () => {
    storeSceneEditorSession()

    let createAttempted = false
    mockCaptureFramePreview.mockResolvedValueOnce(null)

    mockCreateScenePageFetch((input) => {
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
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    expect(
      await screen.findByText(
        /we couldn't capture the current preview frame\. let the preview finish loading and try again\./i,
      ),
    ).toBeInTheDocument()
    expect(createAttempted).toBe(false)
  })

  it('does not create the scene when the live preview returns a non-png thumbnail', async () => {
    storeSceneEditorSession()

    let createAttempted = false
    mockCaptureFramePreview.mockResolvedValueOnce('data:image/webp;base64,AAAA')

    mockCreateScenePageFetch((input) => {
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
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    expect(
      await screen.findByText(/preview capture returned an unsupported image format\./i),
    ).toBeInTheDocument()
    expect(createAttempted).toBe(false)
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
    await user.click(screen.getByRole('button', { name: /create scene/i }))

    expect(
      await screen.findByText(/thumbnail storage is unavailable right now\./i),
    ).toBeInTheDocument()
    expect(createAttempted).toBe(false)
  })
})
