import { useState, type FormEvent } from 'react'
import { formatCompactCount, formatRelativeTime } from '@shared/lib'
import {
  ActionButton,
  CreatorProfileLink,
  LoadingRegion,
  PendingButtonLabel,
  Skeleton,
  UserAvatar,
} from '@shared/ui'
import { readInitial } from '../selectors'
import type { SceneComment, SceneVoteState } from '../types'
import { SceneCommentSkeletonList } from './SceneLoadingSkeletons'
import { VoteButton } from './VoteButton'

type SceneCommentsPanelProps = {
  actionError: string | null
  composerInitial: string
  composerAvatarGradientStart?: string | null
  composerAvatarGradientEnd?: string | null
  composerPrompt: string
  comments: SceneComment[]
  isAuthenticated: boolean
  isLoading: boolean
  isSubmittingComment: boolean
  loadingError: string | null
  pendingVote: { commentId: number; vote: SceneVoteState } | null
  submittingReplyCommentId: number | null
  onRequestSignIn: () => void
  onSubmitComment: (text: string, parentCommentId?: number | null) => Promise<boolean>
  onVoteComment: (comment: SceneComment, vote: SceneVoteState) => void
}

function countComments(comments: SceneComment[]): number {
  return comments.reduce((count, comment) => count + 1 + countComments(comment.replies), 0)
}

function formatCommentTimestamp(createdAt: string | null) {
  return createdAt ? formatRelativeTime(createdAt) : 'Recently'
}

export function SceneCommentsPanel({
  actionError,
  composerInitial,
  composerAvatarGradientStart,
  composerAvatarGradientEnd,
  composerPrompt,
  comments,
  isAuthenticated,
  isLoading,
  isSubmittingComment,
  loadingError,
  pendingVote,
  submittingReplyCommentId,
  onRequestSignIn,
  onSubmitComment,
  onVoteComment,
}: SceneCommentsPanelProps) {
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSort, setCommentSort] = useState<'top' | 'newest'>('top')
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<number | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const commentsCount = countComments(comments)
  const trimmedCommentDraft = commentDraft.trim()
  const sortedComments = [...comments].sort((a, b) => {
    if (commentSort === 'top') {
      const scoreDifference = b.upvotes - b.downvotes - (a.upvotes - a.downvotes)
      if (scoreDifference !== 0) return scoreDifference
    }
    return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')
  })

  async function handleSubmitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!trimmedCommentDraft) {
      return
    }

    const wasCreated = await onSubmitComment(trimmedCommentDraft)

    if (wasCreated) {
      setCommentDraft('')
    }
  }

  async function handleSubmitReply(event: FormEvent<HTMLFormElement>, comment: SceneComment) {
    event.preventDefault()

    const replyDraft = replyDrafts[comment.commentId]?.trim() ?? ''

    if (!replyDraft) {
      return
    }

    const wasCreated = await onSubmitComment(replyDraft, comment.commentId)

    if (wasCreated) {
      setReplyDrafts((currentDrafts) => ({
        ...currentDrafts,
        [comment.commentId]: '',
      }))
      setActiveReplyCommentId(null)
    }
  }

  function renderComment(comment: SceneComment, isReply = false) {
    const replyDraft = replyDrafts[comment.commentId] ?? ''
    const trimmedReplyDraft = replyDraft.trim()
    const isReplyFormOpen = activeReplyCommentId === comment.commentId
    const isReplySubmitting = submittingReplyCommentId === comment.commentId
    const isVotePending = pendingVote?.commentId === comment.commentId

    return (
      <article
        key={comment.commentId}
        className={`mage-comment${isReply ? ' mage-comment--reply' : ''}`}
      >
        <UserAvatar className="mage-comment__avatar" initials={readInitial(comment.authorDisplayName)} gradientStart={comment.authorAvatarGradientStart} gradientEnd={comment.authorAvatarGradientEnd} />
        <div className="mage-comment__body">
          <div className="scene-detail-comment__header">
            <strong className="scene-detail-comment__author">
              <CreatorProfileLink className="scene-detail-comment__author-link" handle={comment.authorHandle}>
                {comment.authorDisplayName}
              </CreatorProfileLink>
            </strong>
            <span>{formatCommentTimestamp(comment.createdAt)}</span>
          </div>
          <p>{comment.text}</p>
          <div className="scene-detail-comment__actions">
            <VoteButton
              className="scene-detail-comment__action"
              count={formatCompactCount(comment.upvotes)}
              direction="up"
              disabled={isVotePending}
              isBusy={isVotePending && pendingVote?.vote === 'up'}
              isSelected={comment.currentUserVote === 'up'}
              onClick={() => {
                onVoteComment(comment, 'up')
              }}
            />
            <VoteButton
              className="scene-detail-comment__action"
              count={formatCompactCount(comment.downvotes)}
              direction="down"
              disabled={isVotePending}
              isBusy={isVotePending && pendingVote?.vote === 'down'}
              isSelected={comment.currentUserVote === 'down'}
              onClick={() => {
                onVoteComment(comment, 'down')
              }}
            />
            {!isReply ? (
              <button
                className="scene-detail-comment__action"
                onClick={() => {
                  if (!isAuthenticated) {
                    onRequestSignIn()
                    return
                  }

                  setActiveReplyCommentId((currentCommentId) =>
                    currentCommentId === comment.commentId ? null : comment.commentId,
                  )
                }}
                type="button"
              >
                Reply
              </button>
            ) : null}
          </div>

          {!isReply && isReplyFormOpen ? (
            <form
              className="scene-detail-reply-composer"
              onSubmit={(event) => {
                void handleSubmitReply(event, comment)
              }}
            >
              <textarea
                aria-label={`Reply to ${comment.authorDisplayName}`}
                className="scene-detail-comment-composer__textarea"
                maxLength={2000}
                onChange={(event) => {
                  setReplyDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [comment.commentId]: event.target.value,
                  }))
                }}
                placeholder={`Reply to ${comment.authorDisplayName}...`}
                rows={2}
                value={replyDraft}
              />
              <div className="scene-detail-comment-form__actions">
                <ActionButton
                  className="scene-detail-comment-cancel-button"
                  onClick={() => {
                    setActiveReplyCommentId(null)
                  }}
                  size="compact"
                  tone="secondary"
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  aria-busy={isReplySubmitting}
                  className="scene-detail-comment-submit-button"
                  disabled={!trimmedReplyDraft || isReplySubmitting}
                  size="compact"
                  tone="primary"
                  type="submit"
                >
                  <PendingButtonLabel pending={isReplySubmitting} pendingLabel="Replying...">
                    Reply
                  </PendingButtonLabel>
                </ActionButton>
              </div>
            </form>
          ) : null}

          {!isReply && comment.replies.length > 0 ? (
            <div className="mage-comment__replies">
              {comment.replies.map((reply) => renderComment(reply, true))}
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <section className="scene-detail-comments-panel">
      <div className="scene-detail-comments-toolbar">
        <div className="mage-comments__header">
          <h2>Comments</h2>
          {isLoading ? (
            <Skeleton className="scene-detail-comments-count-skeleton" shape="line" />
          ) : (
            <span>{commentsCount}</span>
          )}
        </div>
        <ActionButton className="scene-detail-sort-chip" size="compact" tone="secondary"
          onClick={() => setCommentSort((current) => current === 'top' ? 'newest' : 'top')}
          aria-label={commentSort === 'top' ? 'Top comments; switch to newest' : 'Newest first; switch to top comments'}>
          {commentSort === 'top' ? 'Top comments' : 'Newest first'}
        </ActionButton>
      </div>

      <div className="scene-detail-comment-composer">
        <UserAvatar className="scene-detail-comment-composer__avatar" initials={composerInitial} gradientStart={composerAvatarGradientStart} gradientEnd={composerAvatarGradientEnd} />
        {isAuthenticated ? (
          <form className="scene-detail-comment-form" onSubmit={handleSubmitComment}>
            <textarea
              aria-label="Add a public comment"
              className="scene-detail-comment-composer__textarea"
              maxLength={2000}
              onChange={(event) => {
                setCommentDraft(event.target.value)
              }}
              placeholder={composerPrompt}
              rows={2}
              value={commentDraft}
            />
            <div className="scene-detail-comment-form__actions">
              <ActionButton
                aria-busy={isSubmittingComment}
                className="scene-detail-comment-submit-button"
                disabled={!trimmedCommentDraft || isSubmittingComment}
                size="compact"
                tone="primary"
                type="submit"
              >
                <PendingButtonLabel pending={isSubmittingComment} pendingLabel="Commenting...">
                  Comment
                </PendingButtonLabel>
              </ActionButton>
            </div>
          </form>
        ) : (
          <button
            className="scene-detail-comment-composer__field scene-detail-comment-composer__field--button"
            onClick={onRequestSignIn}
            type="button"
          >
            {composerPrompt}
          </button>
        )}
      </div>

      {actionError ? (
        <p className="scene-detail-comments-status" role="status">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingRegion className="scene-detail-comments-loading" label="Loading comments">
          <SceneCommentSkeletonList />
        </LoadingRegion>
      ) : loadingError ? (
        <p className="scene-detail-comments-status" role="status">
          {loadingError}
        </p>
      ) : comments.length > 0 ? (
        <div className="mage-comments__list">{sortedComments.map((comment) => renderComment(comment))}</div>
      ) : (
        <p className="scene-detail-comments-empty">No comments yet.</p>
      )}
    </section>
  )
}
