import { describe, expect, it } from 'vitest'
import { AUTH_SESSION_STORAGE_KEY, persistSession, readStoredSession } from './storage'

describe('stored avatar gradient', () => {
  const user = {
    userId: 8,
    email: 'artist@example.com',
    displayName: 'Scene Artist',
    authProvider: 'LOCAL',
    avatarGradientStart: '#AB3456',
    avatarGradientEnd: '#1234EF',
  }

  it('preserves custom colors through a saved-session round trip', () => {
    persistSession({ accessToken: 'test-token', user })

    expect(readStoredSession()?.user).toMatchObject({
      avatarGradientStart: '#ab3456',
      avatarGradientEnd: '#1234ef',
    })
  })

  it('uses safe defaults for invalid saved colors and supports old sessions', () => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
      accessToken: 'test-token',
      user: { ...user, avatarGradientStart: 'url(https://example.com)', avatarGradientEnd: 123 },
    }))
    expect(readStoredSession()?.user).toMatchObject({
      avatarGradientStart: '#5c51ba',
      avatarGradientEnd: '#264a48',
    })

    persistSession({
      accessToken: 'legacy-token',
      user: { userId: 8, email: user.email, displayName: user.displayName, authProvider: 'LOCAL' },
    })
    expect(readStoredSession()?.user?.displayName).toBe(user.displayName)
    expect(readStoredSession()?.user?.avatarGradientStart).toBeUndefined()
  })
})
