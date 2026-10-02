import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthFormLoadingState } from './AuthLoadingState'
import { useAuth } from './authContext'

type GuardedRouteProps = {
  children: ReactElement
  loadingFallback?: ReactElement
}

type ProtectedRouteProps = {
  children: ReactElement
  loadingFallback: ReactElement
}

export function ProtectedRoute({ children, loadingFallback }: ProtectedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return loadingFallback
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  return children
}

export function GuestOnlyRoute({ children, loadingFallback }: GuardedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return loadingFallback ?? <AuthFormLoadingState label="Restoring your session" />
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return children
}
