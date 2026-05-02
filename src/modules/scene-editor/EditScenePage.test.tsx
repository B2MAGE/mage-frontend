import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import {
  buildSceneEditorApiScene,
  mockCreateScenePageFetch,
  renderEditScenePage,
  selectExistingTag,
  storeSceneEditorSession,
} from './test-fixtures'

const mockCaptureFramePreview = vi.fn(async (): Promise<string | null> => null)

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')

  return {
    ...actual,
    MagePlayer: ({
      initialPlayback,
      onCaptureFramePreviewChange,
      sceneBlob,
    }: {
      initialPlayback?: string
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
        <div data-playback={initialPlayback} data-testid="mage-player">
          {sceneBlob ? 'preview-ready' : 'no-preview'}
        </div>
      )
    },
  }
})

beforeEach(() => {
  mockCaptureFramePreview.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('EditScenePage workflow', () => {
  it('loads the saved scene into the editor and updates details, tags, and thumbnail', async () => {
    storeSceneEditorSession()
    mockCaptureFramePreview.mockResolvedValue('data:image/png;base64,dXBkYXRlZA==')

    const scene = buildSceneEditorApiScene({
      tags: ['ambient'],
    })
    let updateSceneBody: Record<string, unknown> | null = null
    let replaceTagsBody: Record<string, unknown> | null = null
    let finalizeThumbnailBody: Record<string, unknown> | null = null
    let replacementUploadRequested = false

    mockCreateScenePageFetch((input, init) => {
      const method =
        typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'

      if (input === buildApiUrl('/scenes/12') && method === 'GET') {
        return jsonResponse(scene)
      }

      if (input === buildApiUrl('/scenes/12') && method === 'PUT') {
        const nextSubmittedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        updateSceneBody = nextSubmittedBody
        return jsonResponse({
          ...scene,
          description: nextSubmittedBody.description,
          name: nextSubmittedBody.name,
          sceneData: nextSubmittedBody.sceneData,
        })
      }

      if (input === buildApiUrl('/scenes/12/tags') && method === 'PUT') {
        replaceTagsBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return jsonResponse([
          { sceneId: 12, tagId: 1 },
          { sceneId: 12, tagId: 2 },
        ])
      }

      if (input === buildApiUrl('/scenes/12/thumbnail/presign') && method === 'POST') {
        return jsonResponse({
          headers: {
            'Content-Type': 'image/png',
          },
          method: 'PUT',
          objectKey: 'scenes/12/thumbnails/replacement.png',
          uploadUrl: 'https://upload.example.com/scenes/12/thumbnails/replacement.png',
        })
      }

      if (
        input === 'https://upload.example.com/scenes/12/thumbnails/replacement.png' &&
        method === 'PUT'
      ) {
        replacementUploadRequested = true
        return new Response(null, { status: 200 })
      }

      if (input === buildApiUrl('/scenes/12/thumbnail/finalize') && method === 'POST') {
        finalizeThumbnailBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return jsonResponse({
          ...scene,
          thumbnailRef: 'https://cdn.example.com/scenes/12/thumbnails/replacement.png',
        })
      }
    })

    const user = userEvent.setup()

    renderEditScenePage()

    expect(await screen.findByRole('heading', { name: /edit scene/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Aurora Drift')
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'Soft teal bloom with low-end drift.',
    )
    expect(screen.getByAltText(/captured thumbnail preview/i)).toHaveAttribute(
      'src',
      'thumbnails/scene-12.png',
    )
    expect(screen.getByTestId('mage-player')).toHaveAttribute('data-playback', 'playing')
    expect(screen.queryByRole('button', { name: /create scene/i })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^ambient$/i })).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/scene name/i))
    await user.type(screen.getByLabelText(/scene name/i), ' Updated Scene ')
    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), ' Updated from My Scenes. ')
    await selectExistingTag(user, 'focus-friendly')
    await user.click(screen.getByRole('button', { name: /capture again/i }))
    await user.click(screen.getByRole('button', { name: /update scene/i }))

    await waitFor(() =>
      expect(updateSceneBody).toMatchObject({
        description: 'Updated from My Scenes.',
        name: 'Updated Scene',
        sceneData: {
          visualizer: {
            shader: 'nebula',
          },
        },
      }),
    )
    await waitFor(() =>
      expect(finalizeThumbnailBody).toEqual({
        objectKey: 'scenes/12/thumbnails/replacement.png',
      }),
    )
    expect(replaceTagsBody).toEqual({
      tagIds: [1, 2],
    })
    expect(replacementUploadRequested).toBe(true)
    expect(mockCaptureFramePreview).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('does not clear tags when the initial tag list has not loaded yet', async () => {
    storeSceneEditorSession()

    const scene = buildSceneEditorApiScene({
      tags: ['ambient'],
    })
    let updateSceneRequested = false

    mockCreateScenePageFetch((input, init) => {
      const method =
        typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'

      if (input === buildApiUrl('/scenes/12') && method === 'GET') {
        return jsonResponse(scene)
      }

      if (input === buildApiUrl('/tags') && method === 'GET') {
        return jsonResponse({ message: 'Tag service unavailable.' }, 500)
      }

      if (input === buildApiUrl('/scenes/12') && method === 'PUT') {
        updateSceneRequested = true
        return jsonResponse(scene)
      }
    })

    const user = userEvent.setup()

    renderEditScenePage()

    expect(await screen.findByRole('heading', { name: /edit scene/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /update scene/i }))

    expect(await screen.findAllByText(/failed to fetch tags/i)).not.toHaveLength(0)
    expect(updateSceneRequested).toBe(false)
  })
})
