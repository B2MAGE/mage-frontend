export type AuthenticatedUser = {
  userId: number | null
  email: string
  firstName?: string
  lastName?: string
  displayName: string
  authProvider: string
  createdAt?: string
}

export type StoredAuthSession = {
  accessToken: string
  user: AuthenticatedUser | null
}

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type AuthContextValue = {
  accessToken: string | null
  user: AuthenticatedUser | null
  isAuthenticated: boolean
  isRestoringSession: boolean
  completeLoginSession: (session: StoredAuthSession) => void
  updateAuthenticatedUser: (user: AuthenticatedUser) => void
  logout: () => void
  authenticatedFetch: AuthenticatedFetch
}
