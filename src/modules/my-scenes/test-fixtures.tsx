import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, type AuthenticatedUser } from '@auth'
import { LoginPage } from '@modules/auth'
import { SceneDetailPage } from '@modules/scene-detail'
import { buildAuthenticatedUser, storeAuthenticatedSession } from '@shared/test/auth'
import { MyScenesPage } from './MyScenesPage'

export function buildMyScenesStoredUser(
  overrides: Partial<AuthenticatedUser> = {},
) {
  return buildAuthenticatedUser(overrides)
}

export function storeMyScenesSession(
  user: AuthenticatedUser = buildMyScenesStoredUser(),
) {
  storeAuthenticatedSession(user)
}

export function buildMyScenesApiScene(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const sceneId =
    typeof overrides.sceneId === 'number'
      ? overrides.sceneId
      : typeof overrides.id === 'number'
        ? overrides.id
        : 1

  return {
    createdAt: '2026-04-06T14:00:00Z',
    description: 'Soft teal bloom with low-end drift.',
    id: sceneId,
    name: 'Aurora Drift',
    ownerUserId: 42,
    sceneData: {
      visualizer: { shader: 'nebula' },
    },
    sceneId,
    thumbnailRef: `thumbnails/scene-${sceneId}.png`,
    ...overrides,
  }
}

export function renderMyScenesPage(initialEntries = ['/my-scenes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-scenes" element={<MyScenesPage />} />
          <Route path="/scenes/:id" element={<SceneDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}
