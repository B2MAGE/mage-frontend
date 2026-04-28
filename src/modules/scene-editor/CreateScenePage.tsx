import { useNavigate } from 'react-router-dom'
import { useAuth } from '@auth'
import { SceneEditorShell } from './SceneEditorShell'

export function CreateScenePage() {
  const { authenticatedFetch } = useAuth()
  const navigate = useNavigate()

  return (
    <SceneEditorShell
      authenticatedFetch={authenticatedFetch}
      onComplete={() => navigate('/my-scenes')}
    />
  )
}
