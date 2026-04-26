import { readInitial } from '../selectors'
import type { SceneComment } from '../types'
import { VoteButton } from './VoteButton'

type SceneCommentsPanelProps = {
  composerInitial: string
  composerPrompt: string
  comments: SceneComment[]
}

export function SceneCommentsPanel({
  composerInitial,
  composerPrompt,
  comments,
}: SceneCommentsPanelProps) {
  return (
    <section className="scene-detail-comments-panel">
      <div className="scene-detail-comments-toolbar">
        <div className="mage-comments__header">
          <h2>Comments</h2>
          <span>{comments.length}</span>
        </div>
        <button className="scene-detail-sort-chip" type="button">
          Top comments
        </button>
      </div>

      <div className="scene-detail-comment-composer">
        <div className="scene-detail-comment-composer__avatar" aria-hidden="true">
          {composerInitial}
        </div>
        <div className="scene-detail-comment-composer__field">
          <span>{composerPrompt}</span>
        </div>
      </div>

      {comments.length > 0 ? (
        <div className="mage-comments__list">
          {comments.map((comment) => (
            <article key={`${comment.author}-${comment.posted}`} className="mage-comment">
              <div className="mage-comment__avatar" aria-hidden="true">
                {readInitial(comment.author)}
              </div>
              <div className="mage-comment__body">
                <div className="scene-detail-comment__header">
                  <strong>{comment.author}</strong>
                  <span>{comment.handle}</span>
                  <span>{comment.posted}</span>
                </div>
                <p>{comment.text}</p>
                <div className="scene-detail-comment__actions">
                  <VoteButton
                    className="scene-detail-comment__action"
                    count={comment.upvotes}
                    direction="up"
                  />
                  <VoteButton
                    className="scene-detail-comment__action"
                    count={comment.downvotes}
                    direction="down"
                  />
                  <button className="scene-detail-comment__action" type="button">
                    Reply
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="scene-detail-comments-empty">No comments yet.</p>
      )}
    </section>
  )
}
