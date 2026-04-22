import { readStorageItem, removeStorageItem, writeStorageItem } from '@shared/lib'
import type { AuthenticatedUser, StoredAuthSession } from './types'

export const AUTH_SESSION_STORAGE_KEY = 'mage.auth.session'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function splitDisplayName(displayName: string) {
  const trimmedDisplayName = displayName.trim()

  if (!trimmedDisplayName) {
    return {
      firstName: '',
      lastName: '',
    }
  }

  const [firstName = '', ...remainingParts] = trimmedDisplayName.split(/\s+/)

  return {
    firstName,
    lastName: remainingParts.join(' '),
  }
}

function readStoredUser(value: unknown): AuthenticatedUser | null {
  if (!isRecord(value)) {
    return null
  }

  const email = typeof value.email === 'string' ? value.email : null

  if (!email) {
    return null
  }

  const displayName =
    typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName : email
  const derivedNames = splitDisplayName(displayName)

  return {
    userId: typeof value.userId === 'number' ? value.userId : null,
    email,
    firstName: typeof value.firstName === 'string' ? value.firstName : derivedNames.firstName,
    lastName: typeof value.lastName === 'string' ? value.lastName : derivedNames.lastName,
    displayName,
    authProvider: typeof value.authProvider === 'string' ? value.authProvider : 'LOCAL',
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

    return {
      accessToken: parsed.accessToken,
      user: readStoredUser(parsed.user),
    }
  } catch {
    if (!rawSession.trim()) {
      clearStoredSession()
      return null
    }

    return {
      accessToken: rawSession.trim(),
      user: null,
    }
  }
}

export function persistSession(session: StoredAuthSession) {
  writeStorageItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  removeStorageItem(AUTH_SESSION_STORAGE_KEY)
}
