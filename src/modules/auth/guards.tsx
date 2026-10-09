import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './authContext'

type GuardedRouteProps = {
  children: ReactElement
  loadingFallback: ReactElement
}

export function ProtectedRoute({ children, loadingFallback }: GuardedRouteProps) {
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
    return loadingFallback
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return children
}
