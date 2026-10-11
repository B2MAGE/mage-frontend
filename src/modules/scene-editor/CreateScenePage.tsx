import { useNavigate } from 'react-router-dom'
import { useAuth } from '@auth'
import { SceneEditorShell } from './SceneEditorShell'
import { SceneEditorLoadingState } from './SceneEditorLoadingState'

export function CreateScenePage() {
  const { authenticatedFetch, user, isRestoringSession } = useAuth()
  const navigate = useNavigate()

  if (isRestoringSession) return <SceneEditorLoadingState label="Restoring your session before loading the scene editor" />

  return (
    <SceneEditorShell
      key={user?.userId ?? 'signed-out'}
      authenticatedFetch={authenticatedFetch}
      userId={user?.userId}
      onComplete={() => navigate('/my-scenes')}
    />
  )
}
