import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SceneRecoveryPanel } from './SceneRecoveryPanel'
import type { RecoveryReason } from './sceneRecovery'

describe('SceneRecoveryPanel', () => {
  it.each([
    ['stopped', 'Resume scene', /you paused this scene/i],
    ['interrupted', 'Retry scene', /may have been interrupted/i],
    ['runtime', 'Retry scene', /playback error/i],
  ] as const)('explains %s beneath the shared title and keeps its action outside the live announcement', async (reason, action, message) => {
    const onRetry = vi.fn()
    render(<SceneRecoveryPanel block={{ reason, at: 1 }} safeMode={false} onRetry={onRetry} onSafeModeChange={vi.fn()} />)

    const status = screen.getByRole('status')
    expect(within(status).getByText('Playback paused')).toBeInTheDocument()
    expect(within(status).getByText(message)).toBeInTheDocument()
    expect(within(status).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).not.toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: action }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it.each(['stopped', 'interrupted', 'runtime'] satisfies RecoveryReason[])('requires turning off the global pause before resuming a %s scene', async (reason) => {
    const onRetry = vi.fn()
    const onSafeModeChange = vi.fn()
    render(<SceneRecoveryPanel block={{ reason, at: 1 }} safeMode onRetry={onRetry} onSafeModeChange={onSafeModeChange} />)

    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByText(/all scenes and previews are paused/i)).toHaveTextContent('Turn off Pause all scenes to resume playback.')
    const resume = screen.getByRole('button', { name: 'Resume scene' })
    expect(resume).toBeDisabled()
    const pauseAll = screen.getByRole('checkbox', { name: 'Pause all scenes' })
    expect(pauseAll).toBeChecked()
    const user = userEvent.setup()
    await user.click(resume)
    expect(onRetry).not.toHaveBeenCalled()
    await user.click(pauseAll)
    expect(onSafeModeChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('turns on the global pause without retrying or clearing a scene failure', async () => {
    const onRetry = vi.fn()
    const onSafeModeChange = vi.fn()
    render(<SceneRecoveryPanel block={{ reason: 'runtime', at: 1 }} safeMode={false} onRetry={onRetry} onSafeModeChange={onSafeModeChange} />)

    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(onSafeModeChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(onRetry).not.toHaveBeenCalled()
  })
})
