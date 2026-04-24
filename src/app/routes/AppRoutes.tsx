import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { GuestOnlyRoute, LoginPage, RegisterPage } from '@modules/auth'
import { ScenesPage } from '@modules/discovery'
import { HomePage } from '@modules/home'
import { MyScenesPage } from '@modules/my-scenes'
import { CreateScenePage } from '@modules/scene-editor'
import { SceneDetailPage } from '@modules/scene-detail'
import { SettingsPage } from '@modules/settings'
import { ProtectedRoute } from '@modules/auth'

export function AppRoutes() {
  return (
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
  )
}
