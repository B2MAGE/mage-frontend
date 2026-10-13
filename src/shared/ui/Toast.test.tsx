import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('announces politely without taking focus and dismisses after the default duration', () => {
    const onDismiss = vi.fn()
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    render(<Toast message="Template saved." onDismiss={onDismiss} />)
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Template saved.')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true')
    act(() => vi.advanceTimersByTime(5999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledOnce()
    trigger.remove()
  })

  it('allows manual dismissal without later repeating the callback', () => {
    const onDismiss = vi.fn()
    render(<Toast message="Template renamed." onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(6000))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('pauses while hovered or focused and resumes the time remaining after both end', () => {
    const onDismiss = vi.fn()
    render(<><Toast message="Template saved." durationMs={4000} onDismiss={onDismiss} /><button>Editor control</button></>)
    const toast = screen.getByRole('status').parentElement!
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.pointerEnter(toast)
    act(() => vi.advanceTimersByTime(5000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => screen.getByRole('button', { name: 'Dismiss notification' }).focus())
    fireEvent.pointerLeave(toast)
    act(() => vi.advanceTimersByTime(5000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => screen.getByRole('button', { name: 'Editor control' }).focus())
    act(() => vi.advanceTimersByTime(2999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('restarts for a new message while callback-only renders retain the existing timeout', () => {
    const firstDismiss = vi.fn(), latestDismiss = vi.fn()
    const { rerender } = render(<Toast message="Saved." durationMs={1000} onDismiss={firstDismiss} />)
    act(() => vi.advanceTimersByTime(700))
    rerender(<Toast message="Saved." durationMs={1000} onDismiss={latestDismiss} />)
    act(() => vi.advanceTimersByTime(299))
    expect(latestDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(latestDismiss).toHaveBeenCalledOnce()
    rerender(<Toast message="Renamed." durationMs={1000} onDismiss={latestDismiss} />)
    act(() => vi.advanceTimersByTime(999))
    expect(latestDismiss).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(1))
    expect(firstDismiss).not.toHaveBeenCalled()
    expect(latestDismiss).toHaveBeenCalledTimes(2)
  })

  it('cleans up the timer on unmount', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<Toast message="Saved." onDismiss={onDismiss} />)
    unmount()
    act(() => vi.advanceTimersByTime(7000))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
