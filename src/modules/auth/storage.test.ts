import { describe, expect, it } from 'vitest'
import { AUTH_SESSION_STORAGE_KEY, persistSession, readStoredSession } from './storage'

describe('stored avatar gradient', () => {
  const user = {
    userId: 8,
    email: 'artist@example.com',
    displayName: 'Scene Artist',
    handle: 'scene_artist',
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

  it('uses safe defaults for invalid saved colors', () => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
      accessToken: 'test-token',
      user: { ...user, avatarGradientStart: 'url(https://example.com)', avatarGradientEnd: 123 },
    }))
    expect(readStoredSession()?.user).toMatchObject({
      avatarGradientStart: '#5c51ba',
      avatarGradientEnd: '#264a48',
    })

  })

  it.each([
    'old-raw-token',
    '{broken json',
    JSON.stringify({ accessToken: 'old-token' }),
    JSON.stringify({ accessToken: 'old-token', user: null }),
    JSON.stringify({ accessToken: 'old-token', user: { ...user, handle: undefined } }),
    JSON.stringify({ accessToken: 'old-token', user: { ...user, displayName: undefined } }),
  ])('clears historical or malformed sessions instead of restoring them: %s', (stored) => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, stored)
    expect(readStoredSession()).toBeNull()
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })
})
