import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, type AuthenticatedUser } from '@auth'
import { LoginPage } from '@modules/auth'
import { MyScenesPage } from '@modules/my-scenes'
import { buildAuthenticatedUser, storeAuthenticatedSession } from '@shared/test/auth'
import { SceneDetailPage } from './SceneDetailPage'

export function buildSceneDetailStoredUser(
  overrides: Partial<AuthenticatedUser> = {},
) {
  return buildAuthenticatedUser(overrides)
}

export function storeSceneDetailSession(
  user: AuthenticatedUser = buildSceneDetailStoredUser(),
) {
  storeAuthenticatedSession(user)
}

export function buildSceneDetailResponse(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const sceneId =
    typeof overrides.sceneId === 'number' ? overrides.sceneId : 12

  return {
    createdAt: '2026-04-06T14:00:00Z',
    creatorDisplayName: 'Scene Artist',
    description: 'Soft teal bloom with low-end drift.',
    name: 'Aurora Drift',
    ownerUserId: 8,
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 32,
      saves: 150,
      upvotes: 416,
      views: 2999,
    },
    sceneData: {
      visualizer: {
        shader: 'nebula',
      },
    },
    sceneId,
    tags: ['ambient', 'focus-friendly'],
    thumbnailRef: `thumbnails/scene-${sceneId}.png`,
    ...overrides,
  }
}

export function buildSceneCommentResponse(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const commentId =
    typeof overrides.commentId === 'number' ? overrides.commentId : 501
  const sceneId =
    typeof overrides.sceneId === 'number' ? overrides.sceneId : 12

  return {
    authorDisplayName: 'Comment Artist',
    authorUserId: 31,
    commentId,
    createdAt: '2026-04-10T14:00:00Z',
    currentUserVote: null,
    downvotes: 0,
    parentCommentId: null,
    replies: [],
    replyCount: 0,
    sceneId,
    text: 'This scene has a great pulse.',
    upvotes: 2,
    ...overrides,
  }
}

export function renderSceneDetailPage(initialEntries = ['/scenes/12']) {
  function ScenesRouteProbe() {
    const location = useLocation()

    return <div data-testid="scenes-route">{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-scenes" element={<MyScenesPage />} />
          <Route path="/scenes" element={<ScenesRouteProbe />} />
          <Route path="/scenes/:id" element={<SceneDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}
