import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type UserPreset = {
  id: number
  name: string
  thumbnailRef: string | null
}

type UserPresetResponse = {
  id?: number
  presetId?: number
  name?: string
  thumbnailRef?: string | null
}

type DemoPresetThumbnail = {
  background: string
  primary: string
  secondary: string
}

type DemoPresetRequest = {
  name: string
  sceneData: Record<string, unknown>
  thumbnailRef?: string
}

type DemoPresetBlueprint = Omit<DemoPresetRequest, 'thumbnailRef'> & {
  thumbnail?: DemoPresetThumbnail
}

const demoPresetBlueprints: DemoPresetBlueprint[] = [
  {
    name: 'Aurora Drift',
    sceneData: {
      visualizer: {
        shader: 'nebula',
      },
      state: {
        energy: 0.92,
        tempo: 118,
      },
    },
    thumbnail: {
      background: '#06161d',
      primary: '#63f0d6',
      secondary: '#ff7a97',
    },
  },
  {
    name: 'Signal Bloom',
    sceneData: {
      visualizer: {
        shader: 'pulse',
      },
      state: {
        energy: 0.76,
        tempo: 124,
      },
    },
  },
  {
    name: 'Glacier Echo',
    sceneData: {
      visualizer: {
        shader: 'glacier',
      },
      state: {
        energy: 0.58,
        tempo: 96,
      },
    },
    thumbnail: {
      background: '#081820',
      primary: '#7ec8ff',
      secondary: '#f7ff82',
    },
  },
  {
    name: 'Solar Thread',
    sceneData: {
      visualizer: {
        shader: 'ember',
      },
      state: {
        energy: 0.84,
        tempo: 132,
      },
    },
    thumbnail: {
      background: '#15110a',
      primary: '#ffb15a',
      secondary: '#ffd966',
    },
  },
]

function buildDemoThumbnail({ background, primary, secondary }: DemoPresetThumbnail) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><rect width='320' height='180' fill='${background}'/><circle cx='86' cy='94' r='52' fill='${primary}'/><circle cx='244' cy='66' r='34' fill='${secondary}' fill-opacity='.88'/></svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const demoPresetRequests: DemoPresetRequest[] = demoPresetBlueprints.map(({ thumbnail, ...preset }) => ({
  ...preset,
  ...(thumbnail ? { thumbnailRef: buildDemoThumbnail(thumbnail) } : {}),
}))

function isUserPresetResponse(value: unknown): value is UserPresetResponse {
  return typeof value === 'object' && value !== null
}

function normalizePresets(payload: unknown) {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<UserPreset[]>((presets, item) => {
    const presetId =
      isUserPresetResponse(item) && typeof item.id === 'number'
        ? item.id
        : isUserPresetResponse(item) && typeof item.presetId === 'number'
          ? item.presetId
          : null

    if (!isUserPresetResponse(item) || presetId === null) {
      return presets
    }

    presets.push({
      id: presetId,
      name:
        typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Preset ${presetId}`,
      thumbnailRef:
        typeof item.thumbnailRef === 'string' && item.thumbnailRef.trim() ? item.thumbnailRef : null,
    })

    return presets
  }, [])
}

async function fetchUserPresets(authenticatedFetch: AuthenticatedFetch, userId: number) {
  const response = await authenticatedFetch(`/users/${userId}/presets`)

  if (!response.ok) {
    throw new Error('Unable to load presets.')
  }

  const payload = (await response.json().catch(() => [])) as unknown

  return normalizePresets(payload)
}

async function createDemoPresets(authenticatedFetch: AuthenticatedFetch) {
  for (const preset of demoPresetRequests) {
    const response = await authenticatedFetch('/presets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preset),
    })

    if (!response.ok) {
      throw new Error('Unable to add sample presets right now. Please try again in a moment.')
    }
  }
}

export function MyPresetsPage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [presets, setPresets] = useState<UserPreset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSeedingPresets, setIsSeedingPresets] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [seedErrorMessage, setSeedErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (isRestoringSession || !isAuthenticated || typeof user?.userId !== 'number') {
      return
    }

    const userId = user.userId
    let isCurrent = true

    async function loadPresets() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextPresets = await fetchUserPresets(authenticatedFetch, userId)
        if (!isCurrent) {
          return
        }

        setPresets(nextPresets)
      } catch {
        if (!isCurrent) {
          return
        }

        setPresets([])
        setErrorMessage('Unable to load presets right now. Please try again in a moment.')
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadPresets()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, reloadKey, user?.userId])

  async function handleSeedPresets() {
    setIsSeedingPresets(true)
    setSeedErrorMessage('')

    try {
      await createDemoPresets(authenticatedFetch)
      setReloadKey((currentKey) => currentKey + 1)
    } catch (error) {
      setSeedErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to add sample presets right now. Please try again in a moment.',
      )
    } finally {
      setIsSeedingPresets(false)
    }
  }

  if (isRestoringSession) {
    return (
      <main className="card">
        <div className="eyebrow">My Presets</div>
        <h1>Loading presets...</h1>
        <p className="sub">MAGE is restoring your session and loading your saved presets.</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (typeof user?.userId !== 'number') {
    return (
      <main className="card">
        <div className="eyebrow">My Presets</div>
        <h1>Unable to load presets</h1>
        <p className="sub">Your session is missing the user information needed to load presets.</p>
      </main>
    )
  }

  return (
    <main className="preset-page">
      <section className="preset-page-header">
        <div className="eyebrow">My Presets</div>
        <h1>Saved presets</h1>
        <p className="sub">
          Browse the presets created by your account and open any preset detail page directly.
        </p>
      </section>

      <section className="preset-page-panel" aria-live="polite">
        {isLoading ? (
          <p className="preset-status">Loading presets...</p>
        ) : errorMessage ? (
          <p className="preset-status preset-status-error">{errorMessage}</p>
        ) : presets.length === 0 ? (
          <div className="preset-empty-state">
            <p className="preset-status">No presets yet</p>
            <p className="preset-status">
              Temporary helper: add sample presets to this account so you can preview the list UI.
            </p>
            <div className="preset-actions">
              <button
                type="button"
                className="preset-action"
                onClick={() => {
                  void handleSeedPresets()
                }}
                disabled={isSeedingPresets}
              >
                {isSeedingPresets ? 'Adding sample presets...' : 'Add sample presets'}
              </button>
            </div>
            {seedErrorMessage ? (
              <p className="preset-status preset-status-error">{seedErrorMessage}</p>
            ) : null}
          </div>
        ) : (
          <div className="preset-grid" aria-label="My presets">
            {presets.map((preset) => (
              <Link key={preset.id} className="preset-link" to={`/presets/${preset.id}`}>
                {preset.thumbnailRef ? (
                  <img
                    className="preset-thumbnail"
                    src={preset.thumbnailRef}
                    alt={`${preset.name} thumbnail`}
                  />
                ) : (
                  <div className="preset-thumbnail-fallback" aria-label={`${preset.name} thumbnail unavailable`}>
                    No thumbnail available
                  </div>
                )}
                <span className="preset-link-label">{preset.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
