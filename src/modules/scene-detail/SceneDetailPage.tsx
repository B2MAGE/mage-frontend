import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { MagePlayer } from '@modules/player'
import { buildSceneComments } from './fixtures'
import {
  clearSceneVote,
  fetchRecommendedSceneGroups,
  fetchSceneDetail,
  recordSceneView,
  SceneDetailRequestError,
  updateSceneSave,
  updateSceneVote,
} from './loaders'
import { createEmptyRecommendedSceneGroups, selectRecommendedScenes } from './recommendations'
import { readErrorCopy, readInitial, readSceneId } from './selectors'
import type {
  RecommendationFilter,
  RecommendedSceneGroups,
  SceneDetail,
  SceneDetailErrorCode,
  SceneEngagementSummary,
  SceneVoteState,
} from './types'
import { SceneCommentsPanel, SceneDescriptionCard, SceneDetailState, SceneRecommendationRail, VoteButton } from './ui'
import { useScenePlaylistState } from './useScenePlaylistState'
import { buildCreatorProfile, buildSceneDescription, buildSceneEngagement } from './viewModels'

export function SceneDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [errorCode, setErrorCode] = useState<SceneDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [engagementActionError, setEngagementActionError] = useState<string | null>(null)
  const [recommendedSceneGroups, setRecommendedSceneGroups] = useState<RecommendedSceneGroups>(
    createEmptyRecommendedSceneGroups(),
  )
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const recordedViewSceneIds = useRef<Set<number>>(new Set())
  const sceneId = readSceneId(id)
  const {
    handlePlaylistChange,
    handleRemoveTrack,
    handleReorderTracks,
    handleTrackDurationChange,
    handleUpdateTrack,
    isPlaylistOpen,
    isRepeatEnabled,
    isShuffleEnabled,
    playlistName,
    playlistTracks,
    selectedTrackId,
    setIsPlaylistOpen,
    setPlaylistName,
    setSelectedTrackId,
    toggleRepeat,
    toggleShuffle,
  } = useScenePlaylistState(scene?.sceneData)

  useEffect(() => {
    if (sceneId === null || isRestoringSession) {
      return
    }

    const nextSceneId = sceneId
    let isCurrent = true

    async function loadScene() {
      setIsLoading(true)
      setErrorCode(null)
      setScene(null)

      try {
        const nextScene = await fetchSceneDetail(authenticatedFetch, isAuthenticated, nextSceneId)

        if (!isCurrent) {
          return
        }

        setScene(nextScene)
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setErrorCode(error instanceof SceneDetailRequestError ? error.code : 'unavailable')
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
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, sceneId])

  useEffect(() => {
    setIsDescriptionExpanded(false)
    setRecommendationFilter('all')
    setEngagementActionError(null)
  }, [scene?.id])

  useEffect(() => {
    if (!scene || recordedViewSceneIds.current.has(scene.id)) {
      return
    }

    const currentSceneId = scene.id
    let isCurrent = true
    recordedViewSceneIds.current.add(currentSceneId)

    async function recordLoadedSceneView() {
      try {
        const nextEngagement = await recordSceneView(authenticatedFetch, isAuthenticated, currentSceneId)

        if (!isCurrent) {
          return
        }

        setScene((currentScene) =>
          currentScene?.id === currentSceneId
            ? {
                ...currentScene,
                engagement: nextEngagement,
              }
            : currentScene,
        )
      } catch {
        if (isCurrent) {
          recordedViewSceneIds.current.delete(currentSceneId)
        }
      }
    }

    void recordLoadedSceneView()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, scene])

  useEffect(() => {
    if (!scene) {
      setRecommendedSceneGroups(createEmptyRecommendedSceneGroups())
      setIsRecommendationsLoading(false)
      return
    }

    const currentScene = scene
    let isCurrent = true

    async function loadRecommendedScenes() {
      setIsRecommendationsLoading(true)

      try {
        const nextRecommendedSceneGroups = await fetchRecommendedSceneGroups(currentScene)

        if (!isCurrent) {
          return
        }

        setRecommendedSceneGroups(nextRecommendedSceneGroups)
      } catch {
        if (!isCurrent) {
          return
        }

        setRecommendedSceneGroups(createEmptyRecommendedSceneGroups())
      } finally {
        if (isCurrent) {
          setIsRecommendationsLoading(false)
        }
      }
    }

    void loadRecommendedScenes()

    return () => {
      isCurrent = false
    }
  }, [scene])

  if (sceneId === null) {
    const { description, title } = readErrorCopy('invalid-id')

    return (
      <SceneDetailState
        title={title}
        description={description}
        actions={
          <div className="auth-actions">
            <Link className="demo-link" to="/">
              Back to Home
            </Link>
            {isAuthenticated ? (
              <Link className="secondary-link" to="/my-scenes">
                Back to My Scenes
              </Link>
            ) : null}
          </div>
        }
      />
    )
  }

  if (isRestoringSession || isLoading) {
    return (
      <SceneDetailState
        title="Loading scene..."
        description={
          isRestoringSession
            ? 'MAGE is restoring your session before loading this scene.'
            : 'MAGE is fetching scene metadata and loading the embedded player.'
        }
      />
    )
  }

  if (errorCode || !scene) {
    const { description, title } = readErrorCopy(errorCode ?? 'unavailable')

    return (
      <SceneDetailState
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
              <Link className="secondary-link" to="/my-scenes">
                Back to My Scenes
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

  const loadedScene = scene
  const creatorProfile = buildCreatorProfile(loadedScene, user?.displayName, user?.userId)
  const engagement = buildSceneEngagement(loadedScene)
  const sceneDescription = buildSceneDescription(loadedScene)
  const sceneComments = buildSceneComments()
  const filteredRecommendedScenes = selectRecommendedScenes(
    recommendedSceneGroups,
    recommendationFilter,
  )
  const composerInitial = readInitial(user?.displayName ?? 'Guest')
  const composerPrompt = user?.displayName
    ? `Add a comment as ${user.displayName}...`
    : 'Sign in to join the conversation'

  function applySceneEngagement(nextEngagement: SceneEngagementSummary) {
    setScene((currentScene) =>
      currentScene?.id === loadedScene.id
        ? {
            ...currentScene,
            engagement: nextEngagement,
          }
        : currentScene,
    )
  }

  async function runAuthenticatedEngagementAction(action: () => Promise<SceneEngagementSummary>) {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    setEngagementActionError(null)

    try {
      applySceneEngagement(await action())
    } catch (error) {
      if (error instanceof SceneDetailRequestError && error.code === 'auth-required') {
        navigate('/login')
        return
      }

      setEngagementActionError('Unable to update this interaction right now.')
    }
  }

  function handleVoteClick(vote: SceneVoteState) {
    void runAuthenticatedEngagementAction(() =>
      engagement.currentUserVote === vote
        ? clearSceneVote(authenticatedFetch, loadedScene.id)
        : updateSceneVote(authenticatedFetch, loadedScene.id, vote),
    )
  }

  function handleSaveClick() {
    void runAuthenticatedEngagementAction(() =>
      updateSceneSave(authenticatedFetch, loadedScene.id, !engagement.currentUserSaved),
    )
  }

  return (
    <main className="scene-detail-page">
      <section className="mage-watch scene-detail-watch">
        <div className="mage-watch__main">
          <div className="mage-player-shell">
            <div
              className="mage-stage-frame mage-stage-frame--watch scene-detail-stage"
              style={{ '--scene-accent': '#63f0d6' } as CSSProperties}
            >
              <MagePlayer
                ariaLabel={`${scene.name} live render`}
                className="scene-detail-player"
                initialPlayback="playing"
                onPlaylistChange={handlePlaylistChange}
                onRequestPlaylistOpen={() => {
                  setIsPlaylistOpen(true)
                }}
                onSelectedTrackChange={setSelectedTrackId}
                onTrackDurationChange={handleTrackDurationChange}
                playlistTracks={playlistTracks}
                repeatEnabled={isRepeatEnabled}
                sceneBlob={scene.sceneData}
                selectedTrackId={selectedTrackId}
                shuffleEnabled={isShuffleEnabled}
              />
            </div>
          </div>

          <div className="scene-detail-header">
            <h1 className="mage-watch__title">{scene.name}</h1>
          </div>

          <section className="scene-detail-social-row">
            <div className="scene-detail-social-row__creator">
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
                <button className="scene-detail-follow-button" type="button">
                  {creatorProfile.primaryActionLabel}
                </button>
              ) : null}
            </div>

            <div className="scene-detail-action-row">
              <VoteButton
                className="scene-detail-action-chip"
                count={engagement.upvotesLabel}
                direction="up"
                isSelected={engagement.currentUserVote === 'up'}
                onClick={() => {
                  handleVoteClick('up')
                }}
              />
              <VoteButton
                className="scene-detail-action-chip"
                count={engagement.downvotesLabel}
                direction="down"
                isSelected={engagement.currentUserVote === 'down'}
                onClick={() => {
                  handleVoteClick('down')
                }}
              />
              <button className="scene-detail-action-chip" type="button">
                Share
              </button>
              <button
                aria-label={`${engagement.currentUserSaved ? 'Saved' : 'Save'} ${engagement.savesLabel}`}
                aria-pressed={engagement.currentUserSaved}
                className={`scene-detail-action-chip${engagement.currentUserSaved ? ' is-selected' : ''}`}
                onClick={handleSaveClick}
                type="button"
              >
                <span>{engagement.currentUserSaved ? 'Saved' : 'Save'}</span>
                <span>{engagement.savesLabel}</span>
              </button>
            </div>
            {engagementActionError ? (
              <p className="scene-detail-action-error" role="status">
                {engagementActionError}
              </p>
            ) : null}
          </section>

          <SceneDescriptionCard
            engagement={engagement}
            isDescriptionExpanded={isDescriptionExpanded}
            sceneDescription={sceneDescription}
            onToggleDescription={() => {
              setIsDescriptionExpanded((currentValue) => !currentValue)
            }}
          />

          <SceneCommentsPanel
            comments={sceneComments}
            composerInitial={composerInitial}
            composerPrompt={composerPrompt}
          />
        </div>

        <SceneRecommendationRail
          creatorDisplayName={creatorProfile.displayName}
          currentSceneTags={scene.tags}
          isLoading={isRecommendationsLoading}
          isPlaylistOpen={isPlaylistOpen}
          onClosePlaylist={() => {
            setIsPlaylistOpen(false)
          }}
          onPlaylistNameChange={setPlaylistName}
          onReorderTracks={handleReorderTracks}
          onRemoveTrack={handleRemoveTrack}
          onSelectTrack={setSelectedTrackId}
          onToggleRepeat={toggleRepeat}
          onToggleShuffle={toggleShuffle}
          onUpdateTrack={handleUpdateTrack}
          playlistName={playlistName}
          playlistTracks={playlistTracks}
          recommendedScenes={filteredRecommendedScenes}
          recommendationFilter={recommendationFilter}
          repeatEnabled={isRepeatEnabled}
          selectedTrackId={selectedTrackId}
          shuffleEnabled={isShuffleEnabled}
          onSelectFilter={setRecommendationFilter}
        />
      </section>
    </main>
  )
}
