import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { normalizeSceneListItem, parseApiError, type SceneListResponse } from '@shared/lib'
import { SceneEditorShell } from './SceneEditorShell'

type EditableScene = SceneListResponse & {
  tagNames: string[]
}

function readSceneIdParam(sceneIdParam: string | undefined) {
  if (!sceneIdParam || !/^\d+$/.test(sceneIdParam)) {
    return null
  }

  const sceneId = Number(sceneIdParam)
  return Number.isSafeInteger(sceneId) && sceneId > 0 ? sceneId : null
}

function EditSceneState({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <main className="surface surface--hero">
      <div className="eyebrow">Scene Studio</div>
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
    </main>
  )
}

function normalizeSceneTagNames(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { tags?: unknown }).tags)) {
    return []
  }

  return (payload as { tags: unknown[] }).tags
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim())
}

export function EditScenePage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()
  const sceneId = readSceneIdParam(id)
  const [scene, setScene] = useState<EditableScene | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isRestoringSession || !isAuthenticated || sceneId === null) {
      return
    }

    let isCurrent = true

    async function loadScene() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await authenticatedFetch(`/scenes/${sceneId}`)

        if (!response.ok) {
          const apiError = await parseApiError(response)
          throw new Error(apiError?.message ?? 'Unable to load scene for editing.')
        }

        const payload = await response.json().catch(() => null)
        const normalizedScene = normalizeSceneListItem(payload)

        if (!normalizedScene) {
          throw new Error('Scene response is missing the fields required for editing.')
        }

        if (
          typeof user?.userId === 'number' &&
          normalizedScene.ownerUserId !== user.userId
        ) {
          throw new Error('You can only edit scenes created by your account.')
        }

        if (isCurrent) {
          setScene({
            ...normalizedScene,
            tagNames: normalizeSceneTagNames(payload),
          })
        }
      } catch (error) {
        if (isCurrent) {
          setScene(null)
          setErrorMessage(
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Unable to load scene for editing.',
          )
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadScene()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, sceneId, user?.userId])

  if (isRestoringSession) {
    return (
      <EditSceneState
        description="MAGE is restoring your session before opening the editor."
        title="Loading scene..."
      />
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (sceneId === null) {
    return (
      <EditSceneState
        description="This edit route is missing a valid scene id. Check the URL and try again."
        title="Unable to edit scene"
      />
    )
  }

  if (isLoading) {
    return (
      <EditSceneState
        description="MAGE is loading the saved scene before opening the editor."
        title="Loading scene..."
      />
    )
  }

  if (errorMessage || !scene) {
    return (
      <EditSceneState
        description={errorMessage || 'Unable to load scene for editing.'}
        title="Unable to edit scene"
      />
    )
  }

  return (
    <SceneEditorShell
      authenticatedFetch={authenticatedFetch}
      initialState={{
        description: scene.description,
        name: scene.name,
        sceneData: scene.sceneData,
        tagNames: scene.tagNames,
        thumbnailPreviewUrl: scene.thumbnailRef,
      }}
      mode={{ sceneId, type: 'edit' }}
      onComplete={() => navigate('/my-scenes')}
    />
  )
}
