import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Layout } from '@app/Layout'
import { AboutPage } from '@modules/about'
import {
  AuthFormLoadingState,
  ForgotPasswordPage,
  GuestOnlyRoute,
  LoginPage,
  ProtectedRoute,
  RegisterPage,
  ResetPasswordPage,
} from '@modules/auth'
import { ScenesPage } from '@modules/discovery'
import { HomePage } from '@modules/home'
import { MyScenesLoadingState, MyScenesPage } from '@modules/my-scenes'
import { ModerationLoadingState, ModerationPage } from '@modules/moderation'
import { ProfilePage } from '@modules/profile'
import { CreateScenePage, EditScenePage, SceneEditorLoadingState } from '@modules/scene-editor'
import { SceneDetailPage } from '@modules/scene-detail'
import { SettingsLoadingState, SettingsPage } from '@modules/settings'
import { RouteScrollReset } from './RouteScrollReset'

const HANDLE_PATH_PATTERN = /^@[a-z][a-z0-9_]{2,29}$/

function HandleProfileRoute() {
  const { profileHandle = '' } = useParams()
  const canonicalHandle = profileHandle.toLowerCase()

  if (!HANDLE_PATH_PATTERN.test(canonicalHandle)) {
    return <Navigate replace to="/" />
  }

  if (canonicalHandle !== profileHandle) {
    return <Navigate replace to={`/${canonicalHandle}`} />
  }

  return <ProfilePage />
}

export function AppRoutes() {
  return (
    <Layout>
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/scenes" element={<ScenesPage />} />
        <Route
          path="/login"
          element={
            <GuestOnlyRoute
              loadingFallback={<AuthFormLoadingState label="Restoring your saved login" />}
            >
              <LoginPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnlyRoute
              loadingFallback={
                <AuthFormLoadingState
                  label="Restoring your session before account recovery"
                  variant="recovery"
                />
              }
            >
              <ForgotPasswordPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <GuestOnlyRoute
              loadingFallback={
                <AuthFormLoadingState
                  label="Restoring your session before resetting your password"
                />
              }
            >
              <ResetPasswordPage />
            </GuestOnlyRoute>
          }
        />
        <Route
          path="/my-scenes"
          element={
            <ProtectedRoute loadingFallback={<MyScenesLoadingState />}>
              <MyScenesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/scenes/:id" element={<SceneDetailPage />} />
        <Route
          path="/scenes/:id/edit"
          element={
            <ProtectedRoute
              loadingFallback={
                <SceneEditorLoadingState label="Restoring your session before loading the scene editor" />
              }
            >
              <EditScenePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnlyRoute
              loadingFallback={
                <AuthFormLoadingState
                  label="Restoring your session before registration"
                  variant="register"
                />
              }
            >
              <RegisterPage />
            </GuestOnlyRoute>
          }
        />
        <Route path="/create-scene" element={<CreateScenePage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute loadingFallback={<SettingsLoadingState />}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/moderation" element={<ProtectedRoute loadingFallback={<ModerationLoadingState />}><ModerationPage /></ProtectedRoute>} />
        <Route path="/moderation/playback" element={<ProtectedRoute loadingFallback={<ModerationLoadingState />}><ModerationPage section="playback" /></ProtectedRoute>} />
        <Route path="/moderation/moderators" element={<ProtectedRoute loadingFallback={<ModerationLoadingState />}><ModerationPage section="moderators" /></ProtectedRoute>} />
        <Route path="/settings/moderators" element={<Navigate replace to="/moderation/moderators" />} />
        <Route path="/:profileHandle" element={<HandleProfileRoute />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Layout>
  )
}
