import { AUTH_SESSION_STORAGE_KEY, type AuthenticatedUser } from '@auth'

export function buildAuthenticatedUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    authProvider: 'LOCAL',
    displayName: 'Scene Artist',
    email: 'artist@example.com',
    userId: 8,
    ...overrides,
  }
}

export function storeAuthenticatedSession(
  user: AuthenticatedUser = buildAuthenticatedUser(),
  accessToken = 'stored-auth-token',
) {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken,
      user,
    }),
  )
}
