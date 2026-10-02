import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { SceneComment } from '../types'
import { SceneCommentsPanel } from './SceneCommentsPanel'

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function buildComment(overrides: Partial<SceneComment> = {}): SceneComment {
  return {
    commentId: 1,
    sceneId: 42,
    parentCommentId: null,
    authorUserId: 1,
    authorDisplayName: 'Ari Rivera',
    authorHandle: 'aririvera',
    createdAt: '2026-09-29T12:00:00Z',
    text: 'A peaceful scene.',
    replyCount: 0,
    upvotes: 2,
    downvotes: 0,
    currentUserVote: null,
    replies: [],
    ...overrides,
  }
}

function renderComments(comments = [buildComment()]) {
  return render(
    <MemoryRouter initialEntries={['/scenes/42']}>
      <SceneCommentsPanel
        actionError={null}
        composerInitial="AR"
        composerPrompt="Add a comment"
        comments={comments}
        isAuthenticated
        isLoading={false}
        isSubmittingComment={false}
        loadingError={null}
        pendingVote={null}
        submittingReplyCommentId={null}
        onRequestSignIn={vi.fn()}
        onSubmitComment={vi.fn()}
        onVoteComment={vi.fn()}
      />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('SceneCommentsPanel profile links', () => {
  it('links a commenter display name to their normalized handle without displaying the handle', async () => {
    const user = userEvent.setup()
    renderComments([buildComment({ authorHandle: ' @AriRivera ' })])

    const authorLink = screen.getByRole('link', { name: 'Ari Rivera' })
    expect(authorLink).toHaveAttribute('href', '/@aririvera')
    expect(screen.queryByText(/@aririvera/i)).not.toBeInTheDocument()
    expect(screen.getByText('A peaceful scene.')).toBeInTheDocument()

    await user.click(authorLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/@aririvera')
  })

  it('links reply authors by display name and supports keyboard activation', async () => {
    const user = userEvent.setup()
    const { container } = renderComments([buildComment({
      replies: [buildComment({
        commentId: 2,
        parentCommentId: 1,
        authorDisplayName: 'Kai Tanaka',
        authorHandle: 'kaitanaka',
        text: 'I agree.',
      })],
    })])

    const replyLink = screen.getByRole('link', { name: 'Kai Tanaka' })
    expect(replyLink).toHaveAttribute('href', '/@kaitanaka')
    expect(replyLink.closest('.mage-comment--reply')).not.toBeNull()
    expect(screen.queryByText('@kaitanaka')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.mage-comment__avatar')).toHaveLength(2)

    replyLink.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/@kaitanaka')
  })

  it.each([null, '', ' ', 'invalid/handle'])('keeps a display name as plain text when the handle is %j', (authorHandle) => {
    renderComments([buildComment({ authorHandle })])

    expect(screen.getByText('Ari Rivera')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ari Rivera' })).not.toBeInTheDocument()
  })
})
