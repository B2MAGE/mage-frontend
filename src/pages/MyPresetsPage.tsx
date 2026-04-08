import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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

export function MyPresetsPage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [presets, setPresets] = useState<UserPreset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isRestoringSession || !isAuthenticated || typeof user?.userId !== 'number') {
      return
    }

    let isCurrent = true

    async function loadPresets() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const response = await authenticatedFetch(`/users/${user.userId}/presets`)

        if (!response.ok) {
          throw new Error('Unable to load presets.')
        }

        const payload = (await response.json().catch(() => [])) as unknown

        if (!isCurrent) {
          return
        }

        setPresets(normalizePresets(payload))
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
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, user?.userId])

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
          <p className="preset-status">No presets yet</p>
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
