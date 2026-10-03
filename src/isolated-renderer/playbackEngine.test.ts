import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlaybackEngine } from './playbackEngine'
import { SCENE_POLICY } from '../modules/player/policy/sceneValidation'

const { initMAGE } = vi.hoisted(() => ({ initMAGE: vi.fn() }))
vi.mock('@notrac/mage', () => ({ initMAGE }))
beforeEach(() => initMAGE.mockReset())
function fixture() {
  const png = new Uint8Array(33)
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(png.buffer); view.setUint32(16, 10); view.setUint32(20, 10)
  const pngUrl = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`
  let listener: ((event: { type: 'frame' | 'error' }) => void) | undefined
  const engine = { start: vi.fn(), play: vi.fn(), pause: vi.fn(), dispose: vi.fn(), setInputState: vi.fn(),
    setExternalAudioFrame: vi.fn(), setExternalClock: vi.fn(), getEngineTime: vi.fn(() => 2), setSyntheticPreview: vi.fn(),
    loadPreset: vi.fn().mockReturnValue({}), captureFramePreview: vi.fn().mockResolvedValue(pngUrl),
    getEngineFields: vi.fn(() => ({ controlSettings: { active: false, integrated: false },
      camera: { position: { x: 0, y: 0, z: 5 }, up: { x: 0, y: 1, z: 0 } },
      controls: { enabled: false, target: { x: 0, y: 0, z: 0 }, update: vi.fn() },
      visualizer: { render_tooltips: true, mesh: null, getActiveShader: () => 'sphere(1);' } })),
    subscribeRenderLifecycle: vi.fn(callback => { listener = callback; return () => { listener = undefined } }) }
  initMAGE.mockReturnValue(engine)
  const abort = new AbortController(), canvas = document.createElement('canvas'), onError = vi.fn(), onFrame = vi.fn()
  const load = (scene: unknown = { visualizer: { shader: 'sphere(1);' } }) => loadPlaybackEngine({ canvas, signal: abort.signal, scene,
    profile: 'preview', onError, onFrame })
  const ready = async () => { const loading = load(); await vi.waitFor(() => expect(engine.loadPreset).toHaveBeenCalledOnce()); listener?.({ type: 'frame' }); return loading }
  return { engine, abort, canvas, onError, onFrame, load, ready, emit: (type: 'frame' | 'error') => listener?.({ type }) }
}

describe('isolated playback engine', () => {
  it('fails on real canvas context loss even when paused, and ignores disposal events', async () => {
    const f = fixture(), control = await f.ready()
    control.playback(false)
    f.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.onError).toHaveBeenCalledOnce()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    f.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.onError).toHaveBeenCalledOnce()
    const next = fixture(), nextControl = await next.ready()
    nextControl.dispose()
    next.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(next.onError).not.toHaveBeenCalled()
  })

  it('cancels before allocation and rejects parent-only media', async () => {
    const f = fixture(); const loading = f.load(); f.abort.abort()
    await expect(loading).rejects.toThrow()
    await expect(f.load({ visualizer: { shader: 'sphere(1);' }, audioPath: '/song.mp3' })).rejects.toThrow()
    expect(initMAGE).not.toHaveBeenCalled()
  })

  it('resolves and validates template settings before allocating graphics', async () => {
    const f = fixture()
    const loading = f.load({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 })
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    expect(f.engine.loadPreset).toHaveBeenCalledWith(expect.objectContaining({ visualizer: expect.objectContaining({ shader: expect.any(String) }) }))
    f.emit('frame'); (await loading).dispose()
  })

  it('requires a frame after load, materializes optional effect defaults, and enforces the shared budget', async () => {
    const f = fixture(); let completed = false
    f.engine.start.mockImplementation(() => f.emit('frame'))
    const loading = f.load().then(value => { completed = true; return value })
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    expect(completed).toBe(false)
    expect(initMAGE).toHaveBeenCalledWith(expect.objectContaining({ pixelRatio: 1,
      renderBudget: expect.objectContaining({ maxRenderPixels: 230400, maxFramesPerSecond: 30 }) }))
    const preset = f.engine.loadPreset.mock.calls[0][0] as { fx: { passes: Record<string, boolean> } }
    expect(SCENE_POLICY.optionalEffectFlags.every(flag => preset.fx.passes[flag] === false)).toBe(true)
    f.emit('frame'); const control = await loading
    expect(f.onFrame).toHaveBeenCalledOnce()
    control.playback(false); expect(f.engine.pause).toHaveBeenCalledOnce()
    f.emit('error'); expect(f.onError).toHaveBeenCalledOnce(); expect(f.engine.dispose).toHaveBeenCalledOnce()
    control.dispose(); expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('forwards numeric clock/audio/input and ignores controls after disposal', async () => {
    const f = fixture(), control = await f.ready()
    vi.spyOn(f.canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 400, height: 200 } as DOMRect)
    const audio = { frame: null, legacyAmplitude: 0.3, audioTime: 1, playing: true, loaded: true }
    control.input({ time: 2, audio, pointer: { x: 0.5, y: -0.5, down: true } })
    expect(f.engine.setExternalClock).toHaveBeenCalledWith({ time: 2, rate: 1, playing: true })
    expect(f.engine.setExternalAudioFrame).toHaveBeenLastCalledWith(audio)
    expect(f.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({ clientX: 310, clientY: 170, currPointerDown: 1 }))
    control.resize({ width: 600, height: 400, pixelRatio: 1.5 })
    expect(f.canvas.style.width).toBe('600px'); expect(f.canvas.style.height).toBe('400px')
    control.synthetic({ enabled: true, seed: 8, tempoScale: 1.2 })
    expect(f.engine.setSyntheticPreview).toHaveBeenCalledWith(true, 8, 1.2)
    f.abort.abort(); control.playback(true); expect(f.engine.play).toHaveBeenCalledOnce()
  })

  it('preserves authored animation speed and saved time, including while paused', async () => {
    const f = fixture()
    const loading = f.load({ visualizer: { shader: 'sphere(1);' }, intent: { time_multiplier: 0.4 }, state: { time: 3 } })
    await vi.waitFor(() => expect(f.engine.loadPreset).toHaveBeenCalledOnce())
    f.emit('frame'); const control = await loading
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 3, rate: 0.4, playing: true })
    control.playback(false)
    control.input({ time: 10, audio: { frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 7, rate: 0.4, playing: false })
    control.dispose()
  })

  it('bounds captures and rejects wrong type, oversize or late data', async () => {
    const f = fixture(), control = await f.ready()
    const request = { width: 640, height: 640, type: 'image/png' as const, quality: 0.8 }
    const result = await control.capture(request)
    expect(result.width * result.height).toBeLessThanOrEqual(230400)
    expect(result.width).toBe(10); expect(result.height).toBe(10)
    expect(new Uint8Array(result.bytes).slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]))
    f.engine.captureFramePreview.mockResolvedValue('data:image/jpeg;base64,AQID')
    await expect(control.capture(request)).rejects.toThrow()
    f.engine.captureFramePreview.mockResolvedValue(`data:image/png;base64,${'A'.repeat(1_500_000)}`)
    await expect(control.capture(request)).rejects.toThrow()
    let complete!: (value: string) => void
    f.engine.captureFramePreview.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const pending = control.capture(request); f.abort.abort(); complete('data:image/png;base64,AQID')
    await expect(pending).rejects.toThrow()
  })

  it('rejects failed compilation and synchronous startup failure, releasing resources', async () => {
    const f = fixture(); f.engine.loadPreset.mockReturnValue(undefined)
    await expect(f.load()).rejects.toThrow()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    const next = fixture(); next.engine.start.mockImplementation(() => next.emit('error'))
    await expect(next.load()).rejects.toThrow()
    expect(next.engine.loadPreset).not.toHaveBeenCalled()
    expect(next.engine.dispose).toHaveBeenCalledOnce()
  })
})
