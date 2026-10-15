import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioInspectorSnapshot } from './audioInspector'
import { buildMagePlayerController, buildMagePlayerSceneBlob } from './test-fixtures'
import { useAudioInspector } from './useAudioInspector'

const snapshot: AudioInspectorSnapshot = {
  mode: 'legacy', source: 'audio', playing: true, audioLoaded: true,
  levels: { bass: 0.6, mid: 0.3, treble: 0.1, overall: 0.4 },
  hits: { bass: 0.8, mid: 0, treble: 0, overall: 0.4 },
  sceneOutputs: {}, bindings: [], driverSignals: [],
}

describe('optional audio inspector sampling', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  function setup(requestAudioInspector = vi.fn(async () => snapshot as AudioInspectorSnapshot | null)) {
    const player = buildMagePlayerController({ requestAudioInspector })
    const options = { playerRef: { current: player }, playerVersion: 1, ready: true,
      sceneBlob: buildMagePlayerSceneBlob(), onChange: vi.fn() as ((value: AudioInspectorSnapshot | null) => void) | undefined }
    return { player, options, requestAudioInspector }
  }

  it('does no work while closed, samples at most four times a second and stops on close', async () => {
    const { options, requestAudioInspector } = setup()
    const onChange = options.onChange!
    const { rerender } = renderHook(props => useAudioInspector(props), { initialProps: { ...options, onChange: undefined } as typeof options })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(requestAudioInspector).not.toHaveBeenCalled()
    rerender(options)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(onChange).toHaveBeenLastCalledWith(snapshot)
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(requestAudioInspector).toHaveBeenCalledTimes(4)
    rerender({ ...options, onChange: undefined })
    expect(onChange).toHaveBeenLastCalledWith(null)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(requestAudioInspector).toHaveBeenCalledTimes(4)
  })

  it('does not overlap requests or publish a result belonging to an old scene', async () => {
    let resolve!: (value: AudioInspectorSnapshot | null) => void
    const request = vi.fn(() => new Promise<AudioInspectorSnapshot | null>(done => { resolve = done }))
    const { options } = setup(request)
    const { rerender, unmount } = renderHook(props => useAudioInspector(props), { initialProps: options })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(request).toHaveBeenCalledOnce()
    const oldResolve = resolve
    rerender({ ...options, sceneBlob: buildMagePlayerSceneBlob({ visualizer: { shader: 'different' } }) })
    await act(async () => oldResolve(snapshot))
    expect(options.onChange).not.toHaveBeenCalledWith(snapshot)
    unmount()
    await act(async () => resolve(snapshot))
    expect(options.onChange).not.toHaveBeenCalledWith(snapshot)
  })

  it('clears hidden-page readings and only resumes reading when visible', async () => {
    const { options, requestAudioInspector } = setup()
    renderHook(() => useAudioInspector(options))
    await act(() => vi.advanceTimersByTimeAsync(0))
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(options.onChange).toHaveBeenLastCalledWith(null)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(requestAudioInspector).toHaveBeenCalledOnce()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(requestAudioInspector).toHaveBeenCalledTimes(2)
    expect(options.onChange).toHaveBeenLastCalledWith(snapshot)
  })

  it('treats unavailable or rejected readings as optional, without controlling playback', async () => {
    const { player, options, requestAudioInspector } = setup(vi.fn(async () => { throw new Error('Offline inspector') }))
    const { rerender } = renderHook(props => useAudioInspector(props), { initialProps: options })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(options.onChange).toHaveBeenLastCalledWith(null)
    expect(player.setPlaybackState).not.toHaveBeenCalled()
    expect(player.loadSceneBlob).not.toHaveBeenCalled()
    rerender({ ...options, ready: false })
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(requestAudioInspector).toHaveBeenCalledOnce()
  })
})
