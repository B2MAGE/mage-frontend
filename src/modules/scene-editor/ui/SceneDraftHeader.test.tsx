import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SceneDraftHeader } from './SceneDraftHeader'

function headerProps() {
  return {
    canUndo: true, canRedo: false, canReset: true,
    onUndo: vi.fn(), onRedo: vi.fn(), onReset: vi.fn(),
    status: { kind: 'available' as const, message: 'An unfinished browser draft is available.' },
    hasCandidate: true, baseChanged: false, requiresResolution: true,
    isSubmitting: false, saveNeedsReview: false, onRestore: vi.fn(), onDiscard: vi.fn(),
  }
}

describe('SceneDraftHeader', () => {
  it('keeps history actions labeled and puts reset in its own disclosure', async () => {
    const user = userEvent.setup()
    const props = headerProps()
    render(<SceneDraftHeader {...props} />)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(props.onUndo).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Reset draft' })).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Draft options' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Reset draft' }))
    expect(props.onReset).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports keyboard access and closes on Escape, outside click, or focus leaving the header', async () => {
    const user = userEvent.setup()
    render(<><SceneDraftHeader {...headerProps()} /><button>Outside</button></>)
    const trigger = screen.getByRole('button', { name: 'Draft available' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('region', { name: 'Draft available' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Restore draft' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    await user.click(trigger)
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Discard browser draft' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('shows changed-base context and routes Restore and Discard separately', async () => {
    const user = userEvent.setup()
    const props = headerProps()
    render(<SceneDraftHeader {...props} baseChanged />)
    await user.click(screen.getByRole('button', { name: 'Draft available' }))
    expect(screen.getByText(/The saved scene has changed/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Restore draft' }))
    expect(props.onRestore).toHaveBeenCalledOnce()
    expect(props.onDiscard).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Draft available' }))
    await user.click(screen.getByRole('button', { name: 'Discard browser draft' }))
    expect(props.onDiscard).toHaveBeenCalledOnce()
  })

  it('keeps storage warnings and save-review guidance reachable without a recovery candidate', async () => {
    const user = userEvent.setup()
    const props = headerProps()
    const message = 'Browser storage is unavailable. Keep this editor open.'
    const view = render(<SceneDraftHeader {...props} status={{ kind: 'error', message }}
      hasCandidate={false} requiresResolution={false} />)
    expect(screen.getByRole('status')).toHaveTextContent(message)
    await user.click(screen.getByRole('button', { name: 'Draft warning' }))
    expect(within(screen.getByRole('region')).getByText(message)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Restore draft' })).not.toBeInTheDocument()
    view.rerender(<SceneDraftHeader {...props} requiresResolution={false} saveNeedsReview />)
    expect(screen.getByRole('button', { name: 'Review draft' })).toHaveAttribute('data-attention', 'true')
    expect(screen.getByRole('link', { name: 'Open My Scenes' })).toHaveAttribute('href', '/my-scenes')
  })
})
