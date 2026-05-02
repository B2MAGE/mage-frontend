import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider, type AuthenticatedUser } from '@auth'
import { buildApiUrl } from '@shared/lib'
import { buildAuthenticatedUser, storeAuthenticatedSession } from '@shared/test/auth'
import { jsonResponse } from '@shared/test/http'
import { CreateScenePage } from './CreateScenePage'
import { EditScenePage } from './EditScenePage'

export type SceneEditorFetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Response | Promise<Response> | null | undefined

export function buildSceneEditorStoredUser(
  overrides: Partial<AuthenticatedUser> = {},
) {
  return buildAuthenticatedUser(overrides)
}

export function buildSceneEditorTag(
  overrides: Partial<{ tagId: number; name: string }> = {},
) {
  return {
    name: 'ambient',
    tagId: 1,
    ...overrides,
  }
}

export function buildSceneEditorTags() {
  return [
    buildSceneEditorTag(),
    buildSceneEditorTag({
      name: 'focus-friendly',
      tagId: 2,
    }),
  ]
}

export function storeSceneEditorSession(
  user: AuthenticatedUser = buildSceneEditorStoredUser(),
) {
  storeAuthenticatedSession(user)
}

export function mockCreateScenePageFetch(
  handler?: SceneEditorFetchHandler,
  tagsResponse: unknown[] = buildSceneEditorTags(),
  storedUser: AuthenticatedUser = buildSceneEditorStoredUser(),
) {
  const defaultThumbnailUploadUrl =
    'https://upload.example.com/scenes/pending/default/thumbnails/scene-preview-thumbnail.png'
  const sceneThumbnailUploadPattern =
    /^\/api\/scenes\/(?<sceneId>\d+)\/thumbnail\/presign$/
  const sceneThumbnailFinalizePattern =
    /^\/api\/scenes\/(?<sceneId>\d+)\/thumbnail\/finalize$/

  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      typeof init?.method === 'string' ? init.method.toUpperCase() : 'GET'
    const inputString = String(input)

    if (input === buildApiUrl('/users/me')) {
      return Promise.resolve(jsonResponse(storedUser))
    }

    const nextResponse = handler?.(input, init)

    if (nextResponse) {
      return Promise.resolve(nextResponse)
    }

    if (input === buildApiUrl('/tags') && method === 'GET') {
      return Promise.resolve(jsonResponse(tagsResponse))
    }

    if (input === buildApiUrl('/scenes/thumbnail/presign') && method === 'POST') {
      return Promise.resolve(
        jsonResponse({
          headers: {
            'Content-Type': 'image/png',
          },
          method: 'PUT',
          objectKey:
            'scenes/pending/default/thumbnails/scene-preview-thumbnail.png',
          uploadUrl: defaultThumbnailUploadUrl,
        }),
      )
    }

    const sceneThumbnailUploadMatch = inputString.match(sceneThumbnailUploadPattern)
    if (sceneThumbnailUploadMatch?.groups?.sceneId && method === 'POST') {
      const { sceneId } = sceneThumbnailUploadMatch.groups
      return Promise.resolve(
        jsonResponse({
          headers: {
            'Content-Type': 'image/png',
          },
          method: 'PUT',
          objectKey: `scenes/${sceneId}/thumbnails/scene-preview-thumbnail.png`,
          uploadUrl: `https://upload.example.com/scenes/${sceneId}/thumbnails/scene-preview-thumbnail.png`,
        }),
      )
    }

    const sceneThumbnailFinalizeMatch = inputString.match(sceneThumbnailFinalizePattern)
    if (sceneThumbnailFinalizeMatch?.groups?.sceneId && method === 'POST') {
      const sceneId = Number(sceneThumbnailFinalizeMatch.groups.sceneId)
      return Promise.resolve(
        jsonResponse(buildSceneEditorApiScene({
          sceneId,
          thumbnailRef: `https://cdn.example.com/scenes/${sceneId}/thumbnails/scene-preview-thumbnail.png`,
        })),
      )
    }

    if (
      (input === defaultThumbnailUploadUrl ||
        inputString.startsWith('https://upload.example.com/scenes/')) &&
      method === 'PUT'
    ) {
      return Promise.resolve(new Response(null, { status: 200 }))
    }

    throw new Error(`Unexpected request: ${String(input)}`)
  })
}

export function renderCreateScenePage() {
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

export function buildSceneEditorApiScene(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const sceneId = typeof overrides.sceneId === 'number' ? overrides.sceneId : 12

  return {
    createdAt: '2026-04-06T14:00:00Z',
    creatorDisplayName: 'Scene Artist',
    description: 'Soft teal bloom with low-end drift.',
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 0,
      saves: 0,
      upvotes: 0,
      views: 0,
    },
    name: 'Aurora Drift',
    ownerUserId: 8,
    sceneData: {
      controls: {
        position0: { x: 0, y: 0, z: 7 },
        target0: { x: 0, y: 0, z: 0 },
        zoom0: 1,
      },
      visualizer: {
        shader: 'nebula',
        skyboxPreset: 4,
      },
    },
    sceneId,
    thumbnailRef: `thumbnails/scene-${sceneId}.png`,
    ...overrides,
  }
}

export function renderEditScenePage(initialEntries = ['/scenes/12/edit']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/my-scenes" element={<div>My Scenes</div>} />
          <Route path="/scenes/:id/edit" element={<EditScenePage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

export async function selectExistingTag(
  user: ReturnType<typeof userEvent.setup>,
  tagName: string,
) {
  const searchInput = await screen.findByLabelText(/select existing tags/i)

  await user.click(searchInput)
  await user.clear(searchInput)
  await user.type(searchInput, tagName)
  await user.click(
    screen.getByRole('button', { name: new RegExp(`^${tagName}$`, 'i') }),
  )
}

export async function addTagFromSearch(
  user: ReturnType<typeof userEvent.setup>,
  tagName: string,
) {
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
