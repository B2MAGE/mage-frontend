import './App.css'
import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyPresetsPage } from './pages/MyPresetsPage'
import { PresetDetailPage } from './pages/PresetDetailPage'
import { RegisterPage } from './pages/RegisterPage'
import { CreatePresetPage } from './pages/CreatePresetPage'
import { SettingsPage } from './pages/SettingsPage'


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
    return <Navigate replace to="/settings" />
  }

  return children
}

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={
              <GuestOnlyRoute>
                <LoginPage />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/my-presets"
            element={
              <ProtectedRoute>
                <MyPresetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/presets/:id"
            element={<PresetDetailPage />}
          />
          <Route
            path="/register"
            element={
              <GuestOnlyRoute>
                <RegisterPage />
              </GuestOnlyRoute>
            }
          />
          <Route path="/create-preset" element={<CreatePresetPage />} />
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
  )
}

export default App
