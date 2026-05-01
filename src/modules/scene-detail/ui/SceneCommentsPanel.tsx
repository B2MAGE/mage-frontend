import { useState, type FormEvent } from 'react'
import { formatCompactCount, formatRelativeTime } from '@shared/lib'
import { readInitial } from '../selectors'
import type { SceneComment, SceneVoteState } from '../types'
import { VoteButton } from './VoteButton'

type SceneCommentsPanelProps = {
  actionError: string | null
  composerInitial: string
  composerPrompt: string
  comments: SceneComment[]
  isAuthenticated: boolean
  isLoading: boolean
  isSubmittingComment: boolean
  loadingError: string | null
  pendingVoteCommentId: number | null
  submittingReplyCommentId: number | null
  onRequestSignIn: () => void
  onSubmitComment: (text: string, parentCommentId?: number | null) => Promise<boolean>
  onVoteComment: (comment: SceneComment, vote: SceneVoteState) => void
}

function countComments(comments: SceneComment[]): number {
  return comments.reduce((count, comment) => count + 1 + countComments(comment.replies), 0)
}

function buildCommentHandle(comment: SceneComment) {
  const slug = comment.authorDisplayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  if (slug) {
    return `@${slug}`
  }

  return comment.authorUserId ? `@user${comment.authorUserId}` : '@mageuser'
}

function formatCommentTimestamp(createdAt: string | null) {
  return createdAt ? formatRelativeTime(createdAt) : 'Recently'
}

export function SceneCommentsPanel({
  actionError,
  composerInitial,
  composerPrompt,
  comments,
  isAuthenticated,
  isLoading,
  isSubmittingComment,
  loadingError,
  pendingVoteCommentId,
  submittingReplyCommentId,
  onRequestSignIn,
  onSubmitComment,
  onVoteComment,
}: SceneCommentsPanelProps) {
  const [commentDraft, setCommentDraft] = useState('')
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<number | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({})
  const commentsCount = countComments(comments)
  const trimmedCommentDraft = commentDraft.trim()

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
    const isVotePending = pendingVoteCommentId === comment.commentId

    return (
      <article
        key={comment.commentId}
        className={`mage-comment${isReply ? ' mage-comment--reply' : ''}`}
      >
        <div className="mage-comment__avatar" aria-hidden="true">
          {readInitial(comment.authorDisplayName)}
        </div>
        <div className="mage-comment__body">
          <div className="scene-detail-comment__header">
            <strong>{comment.authorDisplayName}</strong>
            <span>{buildCommentHandle(comment)}</span>
            <span>{formatCommentTimestamp(comment.createdAt)}</span>
          </div>
          <p>{comment.text}</p>
          <div className="scene-detail-comment__actions">
            <VoteButton
              className="scene-detail-comment__action"
              count={formatCompactCount(comment.upvotes)}
              direction="up"
              disabled={isVotePending}
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
                <button
                  className="scene-detail-comment-cancel-button"
                  onClick={() => {
                    setActiveReplyCommentId(null)
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="scene-detail-comment-submit-button"
                  disabled={!trimmedReplyDraft || isReplySubmitting}
                  type="submit"
                >
                  {isReplySubmitting ? 'Replying...' : 'Reply'}
                </button>
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
          <span>{commentsCount}</span>
        </div>
        <button className="scene-detail-sort-chip" type="button">
          Top comments
        </button>
      </div>

      <div className="scene-detail-comment-composer">
        <div className="scene-detail-comment-composer__avatar" aria-hidden="true">
          {composerInitial}
        </div>
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
              <button
                className="scene-detail-comment-submit-button"
                disabled={!trimmedCommentDraft || isSubmittingComment}
                type="submit"
              >
                {isSubmittingComment ? 'Commenting...' : 'Comment'}
              </button>
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
        <p className="scene-detail-comments-status" role="status">
          Loading comments...
        </p>
      ) : loadingError ? (
        <p className="scene-detail-comments-status" role="status">
          {loadingError}
        </p>
      ) : comments.length > 0 ? (
        <div className="mage-comments__list">{comments.map((comment) => renderComment(comment))}</div>
      ) : (
        <p className="scene-detail-comments-empty">No comments yet.</p>
      )}
    </section>
  )
}
