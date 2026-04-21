import './App.css'
import './theme/theme.css'
import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyScenesPage } from './pages/MyScenesPage'
import { SceneDetailPage } from './pages/SceneDetailPage'
import { ScenesPage } from './pages/ScenesPage'
import { RegisterPage } from './pages/RegisterPage'
import { CreateScenePage } from './pages/CreateScenePage'
import { SettingsPage } from './pages/SettingsPage'
import { ThemeProvider } from './theme/ThemeProvider'

type ProtectedRouteProps = {
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

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <SessionRestoreState />
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  return children
}

function GuestOnlyRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <SessionRestoreState />
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return children
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/scenes" element={<ScenesPage />} />
            <Route
              path="/login"
              element={
                <GuestOnlyRoute>
                  <LoginPage />
                </GuestOnlyRoute>
              }
            />
            <Route
              path="/my-scenes"
              element={
                <ProtectedRoute>
                  <MyScenesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/scenes/:id" element={<SceneDetailPage />} />
            <Route
              path="/register"
              element={
                <GuestOnlyRoute>
                  <RegisterPage />
                </GuestOnlyRoute>
              }
            />
            <Route path="/create-scene" element={<CreateScenePage />} />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
