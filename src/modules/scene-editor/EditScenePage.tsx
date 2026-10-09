import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { parseSceneDocument } from '@modules/player'
import { normalizeSceneAvailability, normalizeSceneListItem, parseApiError, type SceneListResponse } from '@shared/lib'
import { SceneEditorLoadingState } from './SceneEditorLoadingState'
import { SceneEditorShell } from './SceneEditorShell'
import { readEditableSceneData } from './utils'

type EditableScene = Omit<SceneListResponse, 'sceneData'> & {
  sceneData: Record<string, unknown>
  tagNames: string[]
  unsupportedDocument?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  children,
}: {
  description: string
  title: string
  children?: ReactNode
}) {
  return (
    <main className="surface surface--hero">
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
      {children}
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
  const { authenticatedFetch, user: authenticatedUser } = useAuth()
  const user = authenticatedUser!
  const navigate = useNavigate()
  const { id } = useParams()
  const sceneId = readSceneIdParam(id)
  const [scene, setScene] = useState<EditableScene | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (sceneId === null) {
      return
    }

    let isCurrent = true

    async function loadScene() {
      setIsLoading(true)
      setErrorMessage('')
      setScene(null)

      try {
        const response = await authenticatedFetch(`/scenes/${sceneId}`)

        if (!response.ok) {
          const apiError = await parseApiError(response)
          throw new Error(apiError?.message ?? 'Unable to load scene for editing.')
        }

        const payload = await response.json().catch(() => null)
        if (!isCurrent) return
        const normalizedScene = normalizeSceneListItem(payload)

        if (!normalizedScene || normalizedScene.sceneId !== sceneId) {
          throw new Error('This scene could not be opened for editing.')
        }

        if (
          typeof user.userId !== 'number' ||
          normalizedScene.ownerUserId !== user.userId
        ) {
          throw new Error('You can only edit scenes created by your account.')
        }

        if (normalizedScene.sceneMode === 'legacy-custom') {
          throw new Error('This historical scene format is no longer supported. Create a scene using the current template, Builder, or custom format.')
        }

        let sceneData = normalizedScene.sceneData
        if (sceneData === null) {
          if (normalizedScene.availability?.available !== false || !isRecord(payload) || payload.sceneData !== null) {
            throw new Error('This scene could not be opened for editing.')
          }

          const repairResponse = await authenticatedFetch(`/scenes/${sceneId}/repair`, { cache: 'no-store' })
          if (!isCurrent) return
          if (!repairResponse.ok) {
            throw new Error('Unable to load this scene for repair. Please try again later.')
          }
          const repair: unknown = await repairResponse.json().catch(() => null)
          if (!isCurrent) return
          if (
            !isRecord(repair) || repair.sceneId !== sceneId || repair.ownerUserId !== user.userId ||
            repair.playable !== false || !isRecord(repair.sceneData) ||
            !normalizeSceneAvailability(repair.availability, normalizedScene.sceneId)
          ) {
            throw new Error('This scene could not be opened for repair.')
          }
          // Repair access provides editable source only. The saved scene ID still
          // goes through the player's independent live availability check.
          sceneData = repair.sceneData
        }

        let unsupportedDocument = false
        try {
          const document = parseSceneDocument(sceneData)
          // Keep the original document as the editor's authority. Valid template
          // and Builder settings are editable; unsupported versions remain export-only.
          if (document.kind === 'custom') readEditableSceneData(sceneData)
        } catch {
          // Unsupported documents cannot enter the editor or become a different format.
          unsupportedDocument = true
        }

        if (isCurrent) {
          setScene({
            ...normalizedScene,
            sceneData,
            tagNames: normalizeSceneTagNames(payload),
            ...(unsupportedDocument ? { unsupportedDocument: true } : {}),
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
  }, [authenticatedFetch, sceneId, user.userId])

  if (sceneId === null) {
    return (
      <EditSceneState
        description="This edit route is missing a valid scene id. Check the URL and try again."
        title="Unable to edit scene"
      />
    )
  }

  if (isLoading || (scene && (scene.sceneId !== sceneId || scene.ownerUserId !== user.userId))) {
    return <SceneEditorLoadingState />
  }

  if (errorMessage || !scene) {
    return (
      <EditSceneState
        description={errorMessage || 'Unable to load scene for editing.'}
        title="Unable to edit scene"
      />
    )
  }

  if (scene.unsupportedDocument) {
    const downloadSource = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(scene.sceneData, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `scene-${scene.sceneId}.json`
      link.click()
      URL.revokeObjectURL(url)
    }
    return <EditSceneState
      title="This scene’s format is not supported"
      description="This editor supports current template, Builder, and custom scene documents. The saved data cannot be edited or played.">
      <div className="auth-actions">
        <Link className="demo-link" to={`/scenes/${scene.sceneId}`}>View scene</Link>
        <Link className="secondary-link" to="/my-scenes">Back to My Scenes</Link>
        <button className="secondary-button" type="button" onClick={downloadSource}>Download scene JSON</button>
      </div>
    </EditSceneState>
  }

  return (
    <SceneEditorShell
      key={`${scene.sceneId}:${scene.ownerUserId}`}
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
