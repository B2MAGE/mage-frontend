import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monitorSceneRendering, RENDER_PROGRESS_TIMEOUT_MS, RENDER_STARTUP_TIMEOUT_MS, type RenderLifecycleEvent } from './renderRecoveryMonitor'

describe('render recovery monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  function fixture() {
    let listener: (event: RenderLifecycleEvent) => void = () => {}
    const unsubscribe = vi.fn()
    const onFailure = vi.fn()
    const canvas = document.createElement('canvas')
    const monitor = monitorSceneRendering({ canvas, onFailure, subscribe(next) { listener = next; return unsubscribe } })
    return { monitor, canvas, onFailure, unsubscribe, frame: () => listener({ type: 'frame' }), error: () => listener({ type: 'error' }) }
  }

  it('distinguishes a startup with no rendered frame from later lost progress', () => {
    const startup = fixture()
    vi.advanceTimersByTime(RENDER_STARTUP_TIMEOUT_MS)
    expect(startup.onFailure).toHaveBeenCalledExactlyOnceWith('startup-timeout')
    const playback = fixture()
    playback.frame()
    vi.advanceTimersByTime(RENDER_PROGRESS_TIMEOUT_MS)
    expect(playback.onFailure).toHaveBeenCalledExactlyOnceWith('progress-timeout')
  })

  it('uses actual frame completions, independent of the scene clock or movement', () => {
    const player = fixture()
    for (let index = 0; index < 100; index += 1) {
      vi.advanceTimersByTime(1_000)
      player.frame()
    }
    expect(player.onFailure).not.toHaveBeenCalled()
    player.monitor.dispose()
  })

  it('does not count paused or hidden time, including the return from a background tab', () => {
    const player = fixture()
    player.frame()
    player.monitor.setPaused(true)
    vi.advanceTimersByTime(60_000)
    player.monitor.setPaused(false)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(1_000)
    player.frame()
    expect(player.onFailure).not.toHaveBeenCalled()
    player.monitor.dispose()
  })

  it('reports explicit renderer errors and context loss once, ignoring superseded events', () => {
    const runtime = fixture()
    runtime.error()
    runtime.error()
    runtime.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(runtime.onFailure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(runtime.unsubscribe).toHaveBeenCalledTimes(1)
    const context = fixture()
    context.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(context.onFailure).toHaveBeenCalledExactlyOnceWith('context-lost')
    context.frame()
    vi.advanceTimersByTime(60_000)
    expect(context.onFailure).toHaveBeenCalledTimes(1)
  })

  it('clean disposal removes every listener and pending deadline', () => {
    const player = fixture()
    player.monitor.dispose()
    player.monitor.dispose()
    player.canvas.dispatchEvent(new Event('webglcontextlost'))
    player.error()
    vi.advanceTimersByTime(60_000)
    expect(player.onFailure).not.toHaveBeenCalled()
    expect(player.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('does not invent a progress signal for a renderer without lifecycle support', () => {
    const onFailure = vi.fn()
    const monitor = monitorSceneRendering({ canvas: document.createElement('canvas'), onFailure })
    vi.advanceTimersByTime(60_000)
    expect(onFailure).not.toHaveBeenCalled()
    monitor.dispose()
  })

  it('handles a renderer reporting failure synchronously during subscription', () => {
    const unsubscribe = vi.fn()
    const onFailure = vi.fn()
    const canvas = document.createElement('canvas')
    const monitor = monitorSceneRendering({ canvas, onFailure, subscribe(listener) { listener({ type: 'error' }); return unsubscribe } })
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    canvas.dispatchEvent(new Event('webglcontextlost'))
    vi.advanceTimersByTime(60_000)
    monitor.dispose()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })
})
