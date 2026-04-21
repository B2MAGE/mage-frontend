import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { MagePlayer } from '@modules/player'
import {
  SceneCommentsPanel,
  SceneDescriptionCard,
  SceneDetailState,
  SceneRecommendationRail,
  useScenePlaylistState,
  VoteButton,
} from '@components/scene-detail'
import {
  buildCreatorProfile,
  buildSceneComments,
  buildSceneDescription,
  buildSceneEngagement,
  createEmptyRecommendedSceneGroups,
  fetchRecommendedSceneGroups,
  fetchSceneDetail,
  SceneDetailRequestError,
  readErrorCopy,
  readInitial,
  readSceneId,
  readRecommendationFilterTag,
  type SceneDetail,
  type SceneDetailErrorCode,
  type RecommendedSceneGroups,
  type RecommendationFilter,
} from '@lib/sceneDetail'

export function SceneDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [errorCode, setErrorCode] = useState<SceneDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [recommendedSceneGroups, setRecommendedSceneGroups] = useState<RecommendedSceneGroups>(
    createEmptyRecommendedSceneGroups(),
  )
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
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
  }, [scene?.id])

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

  const creatorProfile = buildCreatorProfile(scene, user?.displayName, user?.userId)
  const engagement = buildSceneEngagement(scene)
  const sceneDescription = buildSceneDescription(scene, creatorProfile)
  const sceneComments = buildSceneComments(scene)
  const activeRecommendationTag = readRecommendationFilterTag(recommendationFilter)
  const filteredRecommendedScenes =
    activeRecommendationTag !== null
      ? recommendedSceneGroups.byTag[activeRecommendationTag] ?? []
      : recommendationFilter === 'creator'
        ? recommendedSceneGroups.creator
        : recommendedSceneGroups.all
  const composerInitial = readInitial(user?.displayName ?? 'Guest')
  const composerPrompt = user?.displayName
    ? `Add a comment as ${user.displayName}...`
    : 'Sign in to join the conversation'

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
              />
              <VoteButton
                className="scene-detail-action-chip"
                count={engagement.downvotesLabel}
                direction="down"
              />
              <button className="scene-detail-action-chip" type="button">
                Share
              </button>
              <button className="scene-detail-action-chip" type="button">
                Save
              </button>
            </div>
          </section>

          <SceneDescriptionCard
            creatorProfile={creatorProfile}
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
