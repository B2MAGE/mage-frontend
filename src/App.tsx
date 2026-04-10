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

type ProtectedRouteProps = {
  children: ReactElement
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return (
      <main className="card">
        <div className="eyebrow">Session</div>
        <h1>Checking your login...</h1>
        <p className="sub">MAGE is restoring your account before opening this page.</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  return children
}

function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
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
            element={
              <ProtectedRoute>
                <PresetDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}

export default App
