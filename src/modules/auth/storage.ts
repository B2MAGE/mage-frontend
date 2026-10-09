import { readStorageItem, removeStorageItem, writeStorageItem } from '@shared/lib'
import { DEFAULT_AVATAR_GRADIENT, normalizeAvatarColor } from '@shared/lib/avatarGradient'
import type { AuthenticatedUser, StoredAuthSession } from './types'

export const AUTH_SESSION_STORAGE_KEY = 'mage.auth.session'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStoredUser(value: unknown): AuthenticatedUser | null {
  if (!isRecord(value)) {
    return null
  }

  const email = typeof value.email === 'string' ? value.email : null

  if (!email || typeof value.userId !== 'number' || !Number.isSafeInteger(value.userId) || value.userId <= 0
    || typeof value.displayName !== 'string' || !value.displayName.trim()
    || typeof value.handle !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(value.handle)
    || typeof value.authProvider !== 'string' || !value.authProvider.trim()) {
    return null
  }

  return {
    userId: value.userId,
    email,
    firstName: typeof value.firstName === 'string' ? value.firstName : undefined,
    lastName: typeof value.lastName === 'string' ? value.lastName : undefined,
    displayName: value.displayName,
    handle: value.handle,
    description:
      typeof value.description === 'string'
        ? value.description
        : value.description === null
          ? null
          : undefined,
    authProvider: value.authProvider,
    ...(value.avatarGradientStart !== undefined ? {
      avatarGradientStart: normalizeAvatarColor(value.avatarGradientStart, DEFAULT_AVATAR_GRADIENT.start),
    } : {}),
    ...(value.avatarGradientEnd !== undefined ? {
      avatarGradientEnd: normalizeAvatarColor(value.avatarGradientEnd, DEFAULT_AVATAR_GRADIENT.end),
    } : {}),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
  }
}

export function readStoredSession(): StoredAuthSession | null {
  const rawSession = readStorageItem(AUTH_SESSION_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSession) as unknown

    if (!isRecord(parsed) || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
      clearStoredSession()
      return null
    }

    const user = readStoredUser(parsed.user)
    if (!user) {
      clearStoredSession()
      return null
    }
    return {
      accessToken: parsed.accessToken,
      user,
    }
  } catch {
    clearStoredSession()
    return null
  }
}

export function persistSession(session: StoredAuthSession) {
  writeStorageItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  removeStorageItem(AUTH_SESSION_STORAGE_KEY)
}
