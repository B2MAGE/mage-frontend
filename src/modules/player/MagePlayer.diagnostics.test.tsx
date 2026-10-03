import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MageEngineDiagnostics } from './infrastructure/engineAdapter'
import { buildMagePlayerController, buildMagePlayerSceneBlob } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

const measurements: MageEngineDiagnostics = { size: 1.5, pointerDown: 0.5, currPointerDown: 1, currAudio: 0.3 }

describe('player live engine diagnostics', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('reads diagnostics only while a subscriber is present and stops its interval on close', async () => {
    const getEngineDiagnostics = vi.fn(() => measurements)
    const controller = buildMagePlayerController({ getEngineDiagnostics })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const interval = vi.spyOn(window, 'setInterval')
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const scene = buildMagePlayerSceneBlob()
    const { rerender, unmount } = render(<MagePlayer sceneBlob={scene} />)
    await waitFor(() => expect(controller.getAudioResponseCapabilities).toHaveBeenCalled())
    expect(getEngineDiagnostics).not.toHaveBeenCalled()
    interval.mockClear()
    const onChange = vi.fn()
    rerender(<MagePlayer sceneBlob={scene} onEngineDiagnosticsChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(measurements)
    expect(interval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 250)
    const diagnosticsInterval = interval.mock.results[0].value
    rerender(<MagePlayer sceneBlob={scene} />)
    expect(clearInterval).toHaveBeenCalledWith(diagnosticsInterval)
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    unmount()
    expect(controller.dispose).toHaveBeenCalledOnce()
  })

  it('publishes changing measurements at the sample rate and skips unchanged readings', async () => {
    const getEngineDiagnostics = vi.fn(() => ({ ...measurements }))
    const controller = buildMagePlayerController({ getEngineDiagnostics })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const interval = vi.spyOn(window, 'setInterval')
    const onChange = vi.fn()
    const { unmount } = render(<MagePlayer sceneBlob={scene} onEngineDiagnosticsChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(measurements))
    const handlers = interval.mock.calls.map(([handler]) => handler).filter(handler => typeof handler === 'function')
    onChange.mockClear()
    act(() => handlers.forEach(handler => handler()))
    expect(onChange).not.toHaveBeenCalled()
    getEngineDiagnostics.mockReturnValue({ ...measurements, currAudio: 0.9 })
    act(() => handlers.forEach(handler => handler()))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...measurements, currAudio: 0.9 })
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    unmount()
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it.each(['missing', 'throwing'] as const)('keeps the preview usable with a %s diagnostics API', async kind => {
    const controller = buildMagePlayerController({ getEngineDiagnostics: kind === 'missing' ? undefined : vi.fn(() => { throw new Error('Unavailable') }) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onChange = vi.fn()
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} onEngineDiagnosticsChange={onChange} />)
    await waitFor(() => expect(controller.getAudioResponseCapabilities).toHaveBeenCalled())
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(controller.dispose).not.toHaveBeenCalled()
  })

  it('clears old readings when the scene disappears or its replacement fails', async () => {
    const controller = buildMagePlayerController({ getEngineDiagnostics: vi.fn(() => measurements) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onChange = vi.fn()
    const scene = buildMagePlayerSceneBlob()
    const { rerender } = render(<MagePlayer sceneBlob={scene} onEngineDiagnosticsChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(measurements))
    rerender(<MagePlayer sceneBlob={null} onEngineDiagnosticsChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(null)
    vi.mocked(controller.loadSceneBlob).mockImplementationOnce(() => { throw new Error('Bad scene') })
    rerender(<MagePlayer sceneBlob={buildMagePlayerSceneBlob({ visualizer: { shader: 'broken' } })} onEngineDiagnosticsChange={onChange} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
