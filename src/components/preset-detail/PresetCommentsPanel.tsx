import type { PresetComment } from '../../lib/presetDetail'
import { readInitial } from '../../lib/presetDetail'
import { VoteButton } from './VoteButton'

type PresetCommentsPanelProps = {
  composerInitial: string
  composerPrompt: string
  comments: PresetComment[]
}

export function PresetCommentsPanel({
  composerInitial,
  composerPrompt,
  comments,
}: PresetCommentsPanelProps) {
  return (
    <section className="preset-detail-comments-panel">
      <div className="preset-detail-comments-toolbar">
        <div className="mage-comments__header">
          <h2>Comments</h2>
          <span>{comments.length}</span>
        </div>
        <button className="preset-detail-sort-chip" type="button">
          Top comments
        </button>
      </div>

      <div className="preset-detail-comment-composer">
        <div className="preset-detail-comment-composer__avatar" aria-hidden="true">
          {composerInitial}
        </div>
        <div className="preset-detail-comment-composer__field">
          <span>{composerPrompt}</span>
        </div>
      </div>

      <div className="mage-comments__list">
        {comments.map((comment) => (
          <article key={`${comment.author}-${comment.posted}`} className="mage-comment">
            <div className="mage-comment__avatar" aria-hidden="true">
              {readInitial(comment.author)}
            </div>
            <div className="mage-comment__body">
              <div className="preset-detail-comment__header">
                <strong>{comment.author}</strong>
                <span>{comment.handle}</span>
                <span>{comment.posted}</span>
              </div>
              <p>{comment.text}</p>
              <div className="preset-detail-comment__actions">
                <VoteButton
                  className="preset-detail-comment__action"
                  count={comment.upvotes}
                  direction="up"
                />
                <VoteButton
                  className="preset-detail-comment__action"
                  count={comment.downvotes}
                  direction="down"
                />
                <button className="preset-detail-comment__action" type="button">
                  Reply
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
