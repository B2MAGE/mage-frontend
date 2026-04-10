import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { MagePlayer } from '../components/MagePlayer'
import { buildApiUrl } from '../lib/api'
import type { MageSceneBlob } from '../lib/magePlayerAdapter'

type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type PresetDetailResponse = {
  id?: number
  presetId?: number
  ownerUserId?: number
  name?: string
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
}

type PresetDetail = {
  id: number
  ownerUserId: number | null
  name: string
  sceneData: MageSceneBlob
  thumbnailRef: string | null
  createdAt: string | null
}

type PresetDetailErrorCode =
  | 'auth-required'
  | 'invalid-id'
  | 'invalid-payload'
  | 'not-found'
  | 'unavailable'

class PresetDetailRequestError extends Error {
  code: PresetDetailErrorCode

  constructor(code: PresetDetailErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPresetId(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
}

function normalizePresetDetail(payload: unknown): PresetDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const presetId =
    typeof payload.presetId === 'number'
      ? payload.presetId
      : typeof payload.id === 'number'
        ? payload.id
        : null

  if (presetId === null || !isRecord(payload.sceneData)) {
    return null
  }

  return {
    id: presetId,
    ownerUserId: typeof payload.ownerUserId === 'number' ? payload.ownerUserId : null,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : `Preset ${presetId}`,
    sceneData: payload.sceneData,
    thumbnailRef:
      typeof payload.thumbnailRef === 'string' && payload.thumbnailRef.trim()
        ? payload.thumbnailRef
        : null,
    createdAt:
      typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : null,
  }
}

function readErrorCode(status: number): PresetDetailErrorCode {
  if (status === 401) {
    return 'auth-required'
  }

  if (status === 404) {
    return 'not-found'
  }

  return 'unavailable'
}

async function fetchPresetDetail(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  presetId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/presets/${presetId}`)
    : await fetch(buildApiUrl(`/presets/${presetId}`))

  if (!response.ok) {
    throw new PresetDetailRequestError(
      readErrorCode(response.status),
      `Preset detail request failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json().catch(() => null)) as PresetDetailResponse | null
  const preset = normalizePresetDetail(payload)

  if (!preset) {
    throw new PresetDetailRequestError(
      'invalid-payload',
      'Preset detail response is missing the data required to render the player.',
    )
  }

  return preset
}

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) {
    return 'Unavailable'
  }

  const parsedDate = new Date(createdAt)

  if (Number.isNaN(parsedDate.getTime())) {
    return createdAt
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

function readErrorCopy(errorCode: PresetDetailErrorCode) {
  if (errorCode === 'invalid-id') {
    return {
      title: 'Invalid preset link',
      description: 'This route is missing a valid preset id. Check the URL and try again.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this preset',
      description:
        'Preset detail requests are still authenticated in this build. Sign in, then reopen this preset route.',
    }
  }

  if (errorCode === 'not-found') {
    return {
      title: 'Preset not found',
      description: 'This preset does not exist or is no longer available.',
    }
  }

  if (errorCode === 'invalid-payload') {
    return {
      title: 'Unable to render this preset',
      description:
        'The backend returned preset detail data, but the scene payload is missing fields required by the player.',
    }
  }

  return {
    title: 'Unable to load this preset',
    description: 'MAGE could not load this preset right now. Please try again in a moment.',
  }
}

function PresetDetailState({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <main className="surface surface--hero">
      <div className="eyebrow">Preset Detail</div>
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
      {actions ? (
        <>
          <div className="divider" />
          {actions}
        </>
      ) : null}
      <p className="page-footnote">Preset detail routes now resolve through the live player flow.</p>
      <div className="page-mark">MAGE</div>
    </main>
  )
}

export function PresetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { authenticatedFetch, isAuthenticated, isRestoringSession } = useAuth()
  const [preset, setPreset] = useState<PresetDetail | null>(null)
  const [errorCode, setErrorCode] = useState<PresetDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const presetId = readPresetId(id)

  useEffect(() => {
    if (presetId === null || isRestoringSession) {
      return
    }

    const nextPresetId = presetId
    let isCurrent = true

    async function loadPreset() {
      setIsLoading(true)
      setErrorCode(null)
      setPreset(null)

      try {
        const nextPreset = await fetchPresetDetail(
          authenticatedFetch,
          isAuthenticated,
          nextPresetId,
        )

        if (!isCurrent) {
          return
        }

        setPreset(nextPreset)
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setErrorCode(error instanceof PresetDetailRequestError ? error.code : 'unavailable')
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadPreset()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, presetId])

  if (presetId === null) {
    const { description, title } = readErrorCopy('invalid-id')

    return (
      <PresetDetailState
        title={title}
        description={description}
        actions={
          <div className="auth-actions">
            <Link className="demo-link" to="/">
              Back to Home
            </Link>
            {isAuthenticated ? (
              <Link className="secondary-link" to="/my-presets">
                Back to My Presets
              </Link>
            ) : null}
          </div>
        }
      />
    )
  }

  if (isRestoringSession || isLoading) {
    return (
      <PresetDetailState
        title="Loading preset..."
        description={
          isRestoringSession
            ? 'MAGE is restoring your session before loading this preset.'
            : 'MAGE is fetching preset metadata and loading the embedded player.'
        }
      />
    )
  }

  if (errorCode || !preset) {
    const { description, title } = readErrorCopy(errorCode ?? 'unavailable')

    return (
      <PresetDetailState
        title={title}
        description={description}
        actions={
          <div className="auth-actions">
            {errorCode === 'auth-required' ? (
              <Link className="demo-link" to="/login">
                Go to Login
              </Link>
            ) : (
              <Link className="demo-link" to="/">
                Back to Home
              </Link>
            )}
            {isAuthenticated ? (
              <Link className="secondary-link" to="/my-presets">
                Back to My Presets
              </Link>
            ) : errorCode !== 'auth-required' ? (
              <Link className="secondary-link" to="/login">
                Sign In
              </Link>
            ) : null}
          </div>
        }
      />
    )
  }

  return (
    <main className="auth-page--wide">
      <section className="surface surface--page-header">
        <div className="eyebrow">Preset Detail</div>
        <h1>{preset.name}</h1>
        <p className="page-lead">
          This preset route fetches the stored scene payload from the backend and renders it
          directly in the shared MAGE player.
        </p>
        <div className="auth-actions">
          {isAuthenticated ? (
            <>
              <Link className="demo-link" to="/my-presets">
                Back to My Presets
              </Link>
              <Link className="secondary-link" to="/create-preset">
                Create Preset
              </Link>
            </>
          ) : (
            <>
              <Link className="demo-link" to="/">
                Back to Home
              </Link>
              <Link className="secondary-link" to="/login">
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="surface surface--page-panel">
        <div className="preset-editor-preview__header">
          <h2>Live Player</h2>
          <p>
            Created {formatCreatedAt(preset.createdAt)}. The player below renders this preset scene
            live in the browser instead of relying on navigation-only state.
          </p>
        </div>

        <MagePlayer
          ariaLabel={`${preset.name} live render`}
          className="preset-editor-preview__player"
          sceneBlob={preset.sceneData}
        />
      </section>
    </main>
  )
}
