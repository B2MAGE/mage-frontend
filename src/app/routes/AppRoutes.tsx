import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@components/Layout'
import { SceneDetailPage } from '@modules/scene-detail'
import { CreateScenePage } from '@pages/CreateScenePage'
import { HomePage } from '@pages/HomePage'
import { LoginPage } from '@pages/LoginPage'
import { MyScenesPage } from '@pages/MyScenesPage'
import { RegisterPage } from '@pages/RegisterPage'
import { ScenesPage } from '@pages/ScenesPage'
import { SettingsPage } from '@pages/SettingsPage'
import { GuestOnlyRoute, ProtectedRoute } from './RouteGuards'

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
