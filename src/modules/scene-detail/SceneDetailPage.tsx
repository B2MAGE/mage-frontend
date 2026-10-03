import { useEffect, useRef, useState, type CSSProperties } from 'react'
import './sceneDetail.css'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import { MagePlayer } from '@modules/player'
import { EngagementButton, PendingButtonLabel, UserAvatar } from '@shared/ui'
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
import {
  SceneCommentsPanel,
  SceneDescriptionCard,
  SceneDetailLoadingState,
  SceneDetailState,
  SceneRecommendationRail,
  VoteButton,
} from './ui'
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

const EMPTY_RECOMMENDATION_TAGS: string[] = []

export function SceneDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [errorCode, setErrorCode] = useState<SceneDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [engagementActionError, setEngagementActionError] = useState<string | null>(null)
  const [pendingEngagementAction, setPendingEngagementAction] = useState<SceneVoteState | 'save' | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [comments, setComments] = useState<SceneComment[]>([])
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentActionError, setCommentActionError] = useState<string | null>(null)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [submittingReplyCommentId, setSubmittingReplyCommentId] = useState<number | null>(null)
  const [pendingCommentVote, setPendingCommentVote] = useState<{ commentId: number; vote: SceneVoteState } | null>(null)
  const [recommendedSceneGroups, setRecommendedSceneGroups] = useState<RecommendedSceneGroups>(
    createEmptyRecommendedSceneGroups(),
  )
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('all')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const recordedViewSceneIds = useRef<Set<number>>(new Set())
  const shareInFlightRef = useRef(false)
  const sceneId = readSceneId(id)
  const loadedSceneId = scene?.id ?? null
  const recommendationOwnerUserId = scene?.ownerUserId ?? null
  const recommendationSceneTags = scene?.tags ?? EMPTY_RECOMMENDATION_TAGS
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
  } = useScenePlaylistState(scene?.sceneData, scene?.id)

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
    setShareStatus(null)
    setIsSharing(false)
    shareInFlightRef.current = false
    setCommentActionError(null)
    setCommentsError(null)
    setPendingEngagementAction(null)
    setPendingCommentVote(null)
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
    if (loadedSceneId === null) {
      setRecommendedSceneGroups(createEmptyRecommendedSceneGroups())
      setIsRecommendationsLoading(false)
      return
    }

    const currentScene = {
      id: loadedSceneId,
      ownerUserId: recommendationOwnerUserId,
      tags: recommendationSceneTags,
    }
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
  }, [loadedSceneId, recommendationOwnerUserId, recommendationSceneTags])

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
    return <SceneDetailLoadingState />
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
  const creatorProfile = buildCreatorProfile(
    loadedScene,
    user?.displayName,
    user?.handle,
    user?.userId,
    user?.avatarGradientStart,
    user?.avatarGradientEnd,
  )
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

  async function runAuthenticatedEngagementAction(
    pendingAction: SceneVoteState | 'save',
    action: () => Promise<SceneEngagementSummary>,
  ) {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    if (pendingEngagementAction !== null) {
      return
    }

    setEngagementActionError(null)
    setPendingEngagementAction(pendingAction)

    try {
      applySceneEngagement(await action())
    } catch (error) {
      if (error instanceof SceneDetailRequestError && error.code === 'auth-required') {
        navigate('/login')
        return
      }

      setEngagementActionError('Unable to update this interaction right now.')
    } finally {
      setPendingEngagementAction(null)
    }
  }

  function handleVoteClick(vote: SceneVoteState) {
    void runAuthenticatedEngagementAction(vote, () =>
      engagement.currentUserVote === vote
        ? clearSceneVote(authenticatedFetch, loadedScene.id)
        : updateSceneVote(authenticatedFetch, loadedScene.id, vote),
    )
  }

  function handleSaveClick() {
    void runAuthenticatedEngagementAction('save', () =>
      updateSceneSave(authenticatedFetch, loadedScene.id, !engagement.currentUserSaved),
    )
  }

  async function handleShare() {
    if (shareInFlightRef.current) {
      return
    }

    shareInFlightRef.current = true
    setIsSharing(true)
    setShareStatus(null)

    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareStatus('Scene link copied.')
    } catch {
      setShareStatus('Unable to copy automatically. Copy this page’s address to share the scene.')
    } finally {
      shareInFlightRef.current = false
      setIsSharing(false)
    }
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

    if (pendingCommentVote !== null) {
      return
    }

    setCommentActionError(null)
    setPendingCommentVote({ commentId: comment.commentId, vote })

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
        setPendingCommentVote(null)
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
                posterUrl={scene.thumbnailRef}
                sceneKey={scene.id}
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
              {creatorProfile.handle ? (
                <Link className="mage-channel-card" to={`/@${creatorProfile.handle}`}>
                  <UserAvatar className="mage-channel-card__avatar" initials={readInitial(creatorProfile.displayName)} gradientStart={creatorProfile.avatarGradientStart} gradientEnd={creatorProfile.avatarGradientEnd} />
                  <div className="mage-channel-card__copy">
                    <strong>{creatorProfile.displayName}</strong>
                    <span>@{creatorProfile.handle}</span>
                  </div>
                </Link>
              ) : (
                <div className="mage-channel-card">
                <UserAvatar className="mage-channel-card__avatar" initials={readInitial(creatorProfile.displayName)} gradientStart={creatorProfile.avatarGradientStart} gradientEnd={creatorProfile.avatarGradientEnd} />
                <div className="mage-channel-card__copy">
                  <strong>{creatorProfile.displayName}</strong>
                </div>
                </div>
              )}

              {user?.userId === scene.ownerUserId ? (
                <Link className="scene-detail-follow-button" to={`/scenes/${scene.id}/edit`}>Edit scene</Link>
              ) : (
                <button className="scene-detail-follow-button" disabled title="Following creators is not available yet" type="button">Follow</button>
              )}
            </div>

            <div className="scene-detail-action-row">
              <VoteButton
                className="scene-detail-action-chip"
                count={engagement.upvotesLabel}
                disabled={pendingEngagementAction !== null}
                direction="up"
                isBusy={pendingEngagementAction === 'up'}
                isSelected={engagement.currentUserVote === 'up'}
                onClick={() => {
                  handleVoteClick('up')
                }}
              />
              <VoteButton
                className="scene-detail-action-chip"
                count={engagement.downvotesLabel}
                disabled={pendingEngagementAction !== null}
                direction="down"
                isBusy={pendingEngagementAction === 'down'}
                isSelected={engagement.currentUserVote === 'down'}
                onClick={() => {
                  handleVoteClick('down')
                }}
              />
              <button
                aria-busy={isSharing}
                className="scene-detail-action-chip"
                disabled={isSharing}
                onClick={() => { void handleShare() }}
                type="button"
              >
                <PendingButtonLabel pending={isSharing} pendingLabel="Copying...">
                  Share
                </PendingButtonLabel>
              </button>
              <EngagementButton
                ariaLabel={`${engagement.currentUserSaved ? 'Saved' : 'Save'} ${engagement.savesLabel}`}
                className="scene-detail-action-chip"
                count={engagement.savesLabel}
                disabled={pendingEngagementAction !== null}
                isBusy={pendingEngagementAction === 'save'}
                isSelected={engagement.currentUserSaved}
                kind="save"
                onClick={handleSaveClick}
              />
            </div>
            {shareStatus ? <p className="scene-detail-share-status" role="status">{shareStatus}</p> : null}
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
            composerAvatarGradientStart={user?.avatarGradientStart}
            composerAvatarGradientEnd={user?.avatarGradientEnd}
            composerPrompt={composerPrompt}
            isAuthenticated={isAuthenticated}
            isLoading={isCommentsLoading}
            isSubmittingComment={isSubmittingComment}
            loadingError={commentsError}
            pendingVote={pendingCommentVote}
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
