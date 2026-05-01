import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { MagePlayer } from '@modules/player'
import {
  clearSceneCommentVote,
  clearSceneVote,
  createSceneComment,
  fetchRecommendedSceneGroups,
  fetchSceneComments,
  fetchSceneDetail,
  recordSceneView,
  SceneDetailRequestError,
  updateSceneCommentVote,
  updateSceneSave,
  updateSceneVote,
} from './loaders'
import { createEmptyRecommendedSceneGroups, selectRecommendedScenes } from './recommendations'
import { readErrorCopy, readInitial, readSceneId } from './selectors'
import type {
  RecommendationFilter,
  RecommendedSceneGroups,
  SceneComment,
  SceneDetail,
  SceneDetailErrorCode,
  SceneEngagementSummary,
  SceneVoteState,
} from './types'
import { SceneCommentsPanel, SceneDescriptionCard, SceneDetailState, SceneRecommendationRail, VoteButton } from './ui'
import { useScenePlaylistState } from './useScenePlaylistState'
import { buildCreatorProfile, buildSceneDescription, buildSceneEngagement } from './viewModels'

function mergeSceneCommentUpdate(currentComment: SceneComment, updatedComment: SceneComment) {
  const preservedReplies =
    updatedComment.replies.length > 0 ? updatedComment.replies : currentComment.replies

  return {
    ...updatedComment,
    replies: preservedReplies,
    replyCount: Math.max(updatedComment.replyCount, preservedReplies.length),
  }
}

function appendSceneComment(comments: SceneComment[], nextComment: SceneComment): SceneComment[] {
  if (nextComment.parentCommentId === null) {
    return [...comments, nextComment]
  }

  return comments.map((comment) => {
    if (comment.commentId === nextComment.parentCommentId) {
      const replies = [...comment.replies, nextComment]

      return {
        ...comment,
        replies,
        replyCount: Math.max(comment.replyCount + 1, replies.length),
      }
    }

    if (comment.replies.length === 0) {
      return comment
    }

    return {
      ...comment,
      replies: appendSceneComment(comment.replies, nextComment),
    }
  })
}

function replaceSceneComment(comments: SceneComment[], updatedComment: SceneComment): SceneComment[] {
  return comments.map((comment) => {
    if (comment.commentId === updatedComment.commentId) {
      return mergeSceneCommentUpdate(comment, updatedComment)
    }

    if (comment.replies.length === 0) {
      return comment
    }

    return {
      ...comment,
      replies: replaceSceneComment(comment.replies, updatedComment),
    }
  })
}

export function SceneDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [errorCode, setErrorCode] = useState<SceneDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [engagementActionError, setEngagementActionError] = useState<string | null>(null)
  const [comments, setComments] = useState<SceneComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentActionError, setCommentActionError] = useState<string | null>(null)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [submittingReplyCommentId, setSubmittingReplyCommentId] = useState<number | null>(null)
  const [pendingCommentVoteId, setPendingCommentVoteId] = useState<number | null>(null)
  const [recommendedSceneGroups, setRecommendedSceneGroups] = useState<RecommendedSceneGroups>(
    createEmptyRecommendedSceneGroups(),
  )
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const recordedViewSceneIds = useRef<Set<number>>(new Set())
  const sceneId = readSceneId(id)
  const loadedSceneId = scene?.id ?? null
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
    setCommentActionError(null)
    setCommentsError(null)
    setPendingCommentVoteId(null)
    setSubmittingReplyCommentId(null)
  }, [loadedSceneId])

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
    if (loadedSceneId === null) {
      setComments([])
      setIsCommentsLoading(false)
      setCommentsError(null)
      return
    }

    const currentSceneId = loadedSceneId
    let isCurrent = true

    async function loadComments() {
      setIsCommentsLoading(true)
      setCommentsError(null)

      try {
        const nextComments = await fetchSceneComments(
          authenticatedFetch,
          isAuthenticated,
          currentSceneId,
        )

        if (!isCurrent) {
          return
        }

        setComments(nextComments)
      } catch {
        if (!isCurrent) {
          return
        }

        setComments([])
        setCommentsError('Unable to load comments right now.')
      } finally {
        if (isCurrent) {
          setIsCommentsLoading(false)
        }
      }
    }

    void loadComments()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, loadedSceneId])

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

  async function handleSubmitComment(text: string, parentCommentId: number | null = null) {
    const trimmedText = text.trim()

    if (!trimmedText) {
      return false
    }

    if (!isAuthenticated) {
      navigate('/login')
      return false
    }

    setCommentActionError(null)

    if (parentCommentId === null) {
      setIsSubmittingComment(true)
    } else {
      setSubmittingReplyCommentId(parentCommentId)
    }

    try {
      const createdComment = await createSceneComment(
        authenticatedFetch,
        loadedScene.id,
        trimmedText,
        parentCommentId,
      )

      setComments((currentComments) => appendSceneComment(currentComments, createdComment))
      return true
    } catch (error) {
      if (error instanceof SceneDetailRequestError && error.code === 'auth-required') {
        navigate('/login')
        return false
      }

      setCommentActionError(
        parentCommentId === null
          ? 'Unable to post this comment right now.'
          : 'Unable to post this reply right now.',
      )
      return false
    } finally {
      if (parentCommentId === null) {
        setIsSubmittingComment(false)
      } else {
        setSubmittingReplyCommentId(null)
      }
    }
  }

  function handleCommentVoteClick(comment: SceneComment, vote: SceneVoteState) {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    if (pendingCommentVoteId !== null) {
      return
    }

    setCommentActionError(null)
    setPendingCommentVoteId(comment.commentId)

    async function updateCommentVote() {
      try {
        const updatedComment =
          comment.currentUserVote === vote
            ? await clearSceneCommentVote(authenticatedFetch, loadedScene.id, comment.commentId)
            : await updateSceneCommentVote(authenticatedFetch, loadedScene.id, comment.commentId, vote)

        setComments((currentComments) => replaceSceneComment(currentComments, updatedComment))
      } catch (error) {
        if (error instanceof SceneDetailRequestError && error.code === 'auth-required') {
          navigate('/login')
          return
        }

        setCommentActionError('Unable to update this comment vote right now.')
      } finally {
        setPendingCommentVoteId(null)
      }
    }

    void updateCommentVote()
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
            actionError={commentActionError}
            comments={comments}
            composerInitial={composerInitial}
            composerPrompt={composerPrompt}
            isAuthenticated={isAuthenticated}
            isLoading={isCommentsLoading}
            isSubmittingComment={isSubmittingComment}
            loadingError={commentsError}
            pendingVoteCommentId={pendingCommentVoteId}
            submittingReplyCommentId={submittingReplyCommentId}
            onRequestSignIn={() => {
              navigate('/login')
            }}
            onSubmitComment={handleSubmitComment}
            onVoteComment={handleCommentVoteClick}
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
