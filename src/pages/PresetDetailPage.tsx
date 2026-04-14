import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { MagePlayer } from '../components/MagePlayer'
import { PresetCommentsPanel } from '../components/preset-detail/PresetCommentsPanel'
import { PresetDescriptionCard } from '../components/preset-detail/PresetDescriptionCard'
import { PresetRecommendationRail } from '../components/preset-detail/PresetRecommendationRail'
import { PresetDetailState } from '../components/preset-detail/PresetDetailState'
import { VoteButton } from '../components/preset-detail/VoteButton'
import {
  buildCreatorProfile,
  buildPresetComments,
  buildPresetDescription,
  buildPresetEngagement,
  buildRecommendedPresets,
  fetchCreatorPresetList,
  fetchPresetDetail,
  PresetDetailRequestError,
  readErrorCopy,
  readInitial,
  readPresetId,
  type PresetDetail,
  type PresetDetailErrorCode,
  type RecommendedPresetCard,
  type RecommendationFilter,
} from '../lib/presetDetail'

export function PresetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [preset, setPreset] = useState<PresetDetail | null>(null)
  const [errorCode, setErrorCode] = useState<PresetDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [creatorPresets, setCreatorPresets] = useState<RecommendedPresetCard[]>([])
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

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
        const nextPreset = await fetchPresetDetail(authenticatedFetch, isAuthenticated, nextPresetId)

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

  useEffect(() => {
    setIsDescriptionExpanded(false)
  }, [preset?.id])

  useEffect(() => {
    const ownerUserId = preset?.ownerUserId ?? null

    if (!preset || ownerUserId === null || !isAuthenticated) {
      setCreatorPresets([])
      setIsRecommendationsLoading(false)
      return
    }

    const currentPreset = preset
    let isCurrent = true

    async function loadCreatorPresets() {
      setIsRecommendationsLoading(true)

      try {
        const nextPresets = await fetchCreatorPresetList(authenticatedFetch, isAuthenticated, ownerUserId)

        if (!isCurrent) {
          return
        }

        setCreatorPresets(buildRecommendedPresets(currentPreset, nextPresets))
      } catch {
        if (!isCurrent) {
          return
        }

        setCreatorPresets([])
      } finally {
        if (isCurrent) {
          setIsRecommendationsLoading(false)
        }
      }
    }

    void loadCreatorPresets()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, preset])

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

  const creatorProfile = buildCreatorProfile(preset, user?.displayName, user?.userId)
  const engagement = buildPresetEngagement(preset)
  const presetDescription = buildPresetDescription(preset, creatorProfile)
  const presetComments = buildPresetComments(preset)
  const filteredRecommendedPresets =
    recommendationFilter === 'creator'
      ? creatorPresets.filter((recommendedPreset) => recommendedPreset.ownerUserId === preset.ownerUserId)
      : creatorPresets
  const composerInitial = readInitial(user?.displayName ?? 'Guest')
  const composerPrompt = user?.displayName
    ? `Add a comment as ${user.displayName}...`
    : 'Sign in to join the conversation'

  return (
    <main className="preset-detail-page">
      <section className="mage-watch preset-detail-watch">
        <div className="mage-watch__main">
          <div className="mage-player-shell">
            <div
              className="mage-stage-frame mage-stage-frame--watch preset-detail-stage"
              style={{ '--preset-accent': '#63f0d6' } as CSSProperties}
            >
              <MagePlayer
                ariaLabel={`${preset.name} live render`}
                className="preset-detail-player"
                sceneBlob={preset.sceneData}
              />
            </div>
          </div>

          <div className="preset-detail-header">
            <h1 className="mage-watch__title">{preset.name}</h1>
          </div>

          <section className="preset-detail-social-row">
            <div className="preset-detail-social-row__creator">
              <div className="mage-channel-card">
                <div className="mage-channel-card__avatar" aria-hidden="true">
                  {readInitial(creatorProfile.displayName)}
                </div>
                <div className="mage-channel-card__copy">
                  <strong>{creatorProfile.displayName}</strong>
                  <span>{creatorProfile.subscribersLabel}</span>
                </div>
              </div>

              {creatorProfile.primaryActionLabel ? (
                <button className="preset-detail-follow-button" type="button">
                  {creatorProfile.primaryActionLabel}
                </button>
              ) : null}
            </div>

            <div className="preset-detail-action-row">
              <VoteButton
                className="preset-detail-action-chip"
                count={engagement.upvotesLabel}
                direction="up"
              />
              <VoteButton
                className="preset-detail-action-chip"
                count={engagement.downvotesLabel}
                direction="down"
              />
              <button className="preset-detail-action-chip" type="button">
                Share
              </button>
              <button className="preset-detail-action-chip" type="button">
                Save
              </button>
            </div>
          </section>

          <PresetDescriptionCard
            creatorProfile={creatorProfile}
            engagement={engagement}
            isDescriptionExpanded={isDescriptionExpanded}
            presetDescription={presetDescription}
            onToggleDescription={() => {
              setIsDescriptionExpanded((currentValue) => !currentValue)
            }}
          />

          <PresetCommentsPanel
            comments={presetComments}
            composerInitial={composerInitial}
            composerPrompt={composerPrompt}
          />
        </div>

        <PresetRecommendationRail
          creatorDisplayName={creatorProfile.displayName}
          isLoading={isRecommendationsLoading}
          recommendedPresets={filteredRecommendedPresets}
          recommendationFilter={recommendationFilter}
          onSelectFilter={setRecommendationFilter}
        />
      </section>
    </main>
  )
}
