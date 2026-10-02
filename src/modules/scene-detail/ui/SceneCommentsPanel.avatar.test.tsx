import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { normalizeSceneComments } from '../dto'
import { SceneCommentsPanel } from './SceneCommentsPanel'

describe('comment avatar colors', () => {
  it('renders each author and the composer with their own gradient', () => {
    const comments = normalizeSceneComments([{
      commentId: 1, sceneId: 1, text: 'Original comment', authorDisplayName: 'First Author',
      authorUserId: 1, authorAvatarGradientStart: '#ab3456', authorAvatarGradientEnd: '#cd1234',
      replies: [{
        commentId: 2, sceneId: 1, text: 'A reply', authorDisplayName: 'Second Author',
        authorUserId: 2, authorAvatarGradientStart: '#1234ab', authorAvatarGradientEnd: '#4567cd',
      }],
    }])
    const { container } = render(<MemoryRouter><SceneCommentsPanel
      actionError={null} composerInitial="VW" composerPrompt="Add a comment"
      composerAvatarGradientStart="#234567" composerAvatarGradientEnd="#567890"
      comments={comments} isAuthenticated isLoading={false} isSubmittingComment={false}
      loadingError={null} pendingVote={null} submittingReplyCommentId={null}
      onRequestSignIn={vi.fn()} onSubmitComment={vi.fn()} onVoteComment={vi.fn()}
    /></MemoryRouter>)

    expect(container.querySelector('.scene-detail-comment-composer__avatar')).toHaveStyle({
      backgroundImage: 'linear-gradient(145deg, #234567, #567890)',
    })
    const authorAvatars = container.querySelectorAll('.mage-comment__avatar')
    expect(authorAvatars).toHaveLength(2)
    expect(authorAvatars[0]).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #ab3456, #cd1234)' })
    expect(authorAvatars[1]).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #1234ab, #4567cd)' })
  })
})
