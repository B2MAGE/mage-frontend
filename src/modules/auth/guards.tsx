import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './authContext'

type GuardedRouteProps = {
  children: ReactElement
}

function SessionRestoreState() {
  return (
    <main className="card">
      <div className="eyebrow">Session</div>
      <h1>Checking your login...</h1>
      <p className="sub">MAGE is restoring your account before opening this page.</p>
    </main>
  )
}

export function ProtectedRoute({ children }: GuardedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <SessionRestoreState />
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  return children
}

export function GuestOnlyRoute({ children }: GuardedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <SessionRestoreState />
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return children
}
