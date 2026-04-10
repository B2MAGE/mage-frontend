/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'
import { buildApiUrl } from '../lib/api'

export type AuthenticatedUser = {
  userId: number | null
  email: string
  displayName: string
  authProvider: string
  createdAt?: string
}

type StoredAuthSession = {
  accessToken: string
  user: AuthenticatedUser | null
}

type AuthContextValue = {
  accessToken: string | null
  user: AuthenticatedUser | null
  isAuthenticated: boolean
  isRestoringSession: boolean
  completeLoginSession: (session: StoredAuthSession) => void
  logout: () => void
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export const AUTH_SESSION_STORAGE_KEY = 'mage.auth.session'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
    typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName
      : email

  return {
    userId: typeof value.userId === 'number' ? value.userId : null,
    email,
    displayName,
    authProvider: typeof value.authProvider === 'string' ? value.authProvider : 'LOCAL',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
  }
}

function readStoredSession(): StoredAuthSession | null {
  const rawSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSession) as unknown

    if (!isRecord(parsed) || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }

    return {
      accessToken: parsed.accessToken,
      user: readStoredUser(parsed.user),
    }
  } catch {
    if (!rawSession.trim()) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }

    return {
      accessToken: rawSession.trim(),
      user: null,
    }
  }
}

function persistSession(session: StoredAuthSession) {
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

function buildAuthorizationHeaders(headers: HeadersInit | undefined, accessToken: string) {
  const nextHeaders = new Headers(headers)
  nextHeaders.set('Authorization', `Bearer ${accessToken}`)
  return nextHeaders
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredAuthSession | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)

  function clearSession() {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    setSession(null)
  }

  function completeLoginSession(nextSession: StoredAuthSession) {
    persistSession(nextSession)
    setSession(nextSession)
  }

  async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    if (!session?.accessToken) {
      throw new Error('Authentication is required to perform this request.')
    }

    const resolvedInput =
      typeof input === 'string' && input.startsWith('/') ? buildApiUrl(input) : input

    const response = await fetch(resolvedInput, {
      ...init,
      headers: buildAuthorizationHeaders(init.headers, session.accessToken),
    })

    if (response.status === 401) {
      clearSession()
    }

    return response
  }

  useEffect(() => {
    const storedSession = readStoredSession()

    if (!storedSession) {
      setIsRestoringSession(false)
      return
    }

    const bootstrappedSession = storedSession

    setSession(bootstrappedSession)

    let isCurrent = true

    async function restoreAuthenticatedUser() {
      try {
        const response = await fetch(buildApiUrl('/users/me'), {
          headers: buildAuthorizationHeaders(undefined, bootstrappedSession.accessToken),
        })

        if (!isCurrent) {
          return
        }

        if (response.status === 401) {
          clearSession()
          return
        }

        if (!response.ok) {
          return
        }

        const restoredUser = (await response.json()) as AuthenticatedUser
        const restoredSession = {
          accessToken: bootstrappedSession.accessToken,
          user: restoredUser,
        }

        persistSession(restoredSession)
        setSession(restoredSession)
      } catch {
        // Preserve the stored session snapshot when bootstrap verification fails.
      } finally {
        if (isCurrent) {
          setIsRestoringSession(false)
        }
      }
    }

    void restoreAuthenticatedUser()

    return () => {
      isCurrent = false
    }
  }, [])

  const value: AuthContextValue = {
    accessToken: session?.accessToken ?? null,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.accessToken && session?.user),
    isRestoringSession,
    completeLoginSession,
    logout: clearSession,
    authenticatedFetch,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
