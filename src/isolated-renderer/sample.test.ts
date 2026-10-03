import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadKnownSample } from './sample'

const { initMAGE } = vi.hoisted(() => ({ initMAGE: vi.fn() }))
vi.mock('@notrac/mage', () => ({ initMAGE }))

type RenderEvent = { type: 'frame' | 'error' }

function fixture() {
  let listener: ((event: RenderEvent) => void) | undefined
  const unsubscribe = vi.fn(() => { listener = undefined })
  // Deliberately expose only methods present in the installed engine API.
  const engine = {
    start: vi.fn(),
    loadPreset: vi.fn().mockReturnValue({ visualizer: { shader: 'loaded' } }),
    subscribeRenderLifecycle: vi.fn((callback: (event: RenderEvent) => void) => {
      listener = callback
      return unsubscribe
    }),
    play: vi.fn(),
    dispose: vi.fn(),
  }
  initMAGE.mockReturnValue(engine)
  const abort = new AbortController()
  const onError = vi.fn()
  const canvas = document.createElement('canvas')
  return {
    engine, unsubscribe, abort, onError, canvas,
    load: () => loadKnownSample(canvas, abort.signal, onError),
    emit: (type: RenderEvent['type']) => listener?.({ type }),
  }
}

beforeEach(() => initMAGE.mockReset())

describe('known isolated sample lifecycle', () => {
  it('does not allocate graphics after cancellation while importing the engine', async () => {
    const f = fixture()
    const loading = f.load()
    f.abort.abort()
    await expect(loading).rejects.toThrow()
    expect(initMAGE).not.toHaveBeenCalled()
  })

  it('waits for a frame after loading the sample and keeps observing later failures', async () => {
    const f = fixture()
    f.engine.start.mockImplementation(() => f.emit('frame'))
    let completed = false
    const loading = f.load().then(release => { completed = true; return release })
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    expect(completed).toBe(false)
    expect(initMAGE).toHaveBeenCalledWith(expect.objectContaining({
      canvas: f.canvas, autoStart: false,
      withControls: { active: false, integrated: false },
      renderBudget: expect.objectContaining({ maxFramesPerSecond: 30, maxRenderPixels: 230400 }),
    }))
    f.emit('frame')
    const release = await loading
    expect(f.unsubscribe).not.toHaveBeenCalled()
    expect(f.onError).not.toHaveBeenCalled()
    f.emit('error')
    expect(f.onError).toHaveBeenCalledOnce()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    release()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('does not miss an engine error emitted synchronously during startup', async () => {
    const f = fixture()
    f.engine.start.mockImplementation(() => f.emit('error'))
    await expect(f.load()).rejects.toThrow()
    expect(f.onError).toHaveBeenCalledOnce()
    expect(f.engine.loadPreset).not.toHaveBeenCalled()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('cleans up when startup throws before a sample can load', async () => {
    const f = fixture()
    f.engine.start.mockImplementation(() => { throw new Error('GPU startup failed') })
    await expect(f.load()).rejects.toThrow('GPU startup failed')
    expect(f.engine.loadPreset).not.toHaveBeenCalled()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    f.abort.abort()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('rejects an invalid preset instead of reporting a successful scene', async () => {
    const f = fixture()
    f.engine.loadPreset.mockReturnValue(undefined)
    await expect(f.load()).rejects.toThrow()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('rejects a GPU failure before the first sample frame', async () => {
    const f = fixture()
    const failed = expect(f.load()).rejects.toThrow()
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    f.emit('error')
    await failed
    expect(f.onError).toHaveBeenCalledOnce()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('cancels pending rendering and ignores late frame delivery', async () => {
    const f = fixture()
    const failed = expect(f.load()).rejects.toThrow()
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    f.abort.abort()
    f.emit('frame')
    await failed
    expect(f.onError).not.toHaveBeenCalled()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })

  it('releases a completed sample once when the frame is removed', async () => {
    const f = fixture()
    const loading = f.load()
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    f.emit('frame')
    const release = await loading
    f.abort.abort()
    release()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
    expect(f.onError).not.toHaveBeenCalled()
  })

  it('settles a pending render even if graphics cleanup throws', async () => {
    const f = fixture()
    f.engine.dispose.mockImplementation(() => { throw new Error('GPU cleanup failed') })
    const failed = expect(f.load()).rejects.toThrow()
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    f.abort.abort()
    await failed
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.unsubscribe).toHaveBeenCalledOnce()
  })
})
