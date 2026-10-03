import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { AuthContext } from './authContext'
import { authenticatedRequest, fetchAuthenticatedUser } from './client'
import { clearStoredSession, persistSession, readStoredSession } from './storage'
import type { AuthContextValue, AuthenticatedUser, StoredAuthSession } from './types'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredAuthSession | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const currentToken = useRef<string | null>(null)

  function clearSession() {
    currentToken.current = null
    clearStoredSession()
    setSession(null)
  }

  function completeLoginSession(nextSession: StoredAuthSession) {
    currentToken.current = nextSession.accessToken
    persistSession(nextSession)
    setSession(nextSession)
  }

  function updateAuthenticatedUser(nextUser: AuthenticatedUser) {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession
      }

      const nextSession = {
        ...currentSession,
        user: nextUser,
      }

      persistSession(nextSession)
      return nextSession
    })
  }

  async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    if (!session?.accessToken) {
      throw new Error('Authentication is required to perform this request.')
    }

    const response = await authenticatedRequest(session.accessToken, input, init)

    if (response.status === 401 && currentToken.current === session.accessToken) {
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
    currentToken.current = bootstrappedSession.accessToken

    setSession(bootstrappedSession)

    let isCurrent = true

    async function restoreAuthenticatedSession() {
      try {
        const response = await fetchAuthenticatedUser(bootstrappedSession.accessToken)

        if (!isCurrent || currentToken.current !== bootstrappedSession.accessToken) {
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
        if (!isCurrent || currentToken.current !== bootstrappedSession.accessToken) return
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

    void restoreAuthenticatedSession()

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
    updateAuthenticatedUser,
    logout: clearSession,
    authenticatedFetch,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
