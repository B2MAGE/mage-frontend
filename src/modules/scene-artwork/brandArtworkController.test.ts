import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BRAND_SCENE } from '../player/templates/platformBrandScene'
import { createBrandArtworkController, type BrandArtworkController } from './brandArtworkController'

const mocks = vi.hoisted(() => ({
  initMAGE: vi.fn(), start: vi.fn(), pause: vi.fn(), loadPreset: vi.fn(), dispose: vi.fn(),
  captureFramePreview: vi.fn(), setSyntheticPreview: vi.fn(), attachMouse: vi.fn(),
  mouseDispose: vi.fn(), sceneLoaded: vi.fn(), unsubscribe: vi.fn(),
  renderListeners: new Set<(event: { type: 'frame' | 'error' }) => void>(),
  recoveryListeners: new Set<() => void>(), safeMode: false,
}))
vi.mock('@notrac/mage', () => ({ initMAGE: mocks.initMAGE }))
vi.mock('../player/infrastructure/viewerMouseInteractions', () => ({ attachViewerMouseInteractions: mocks.attachMouse }))
vi.mock('../player/recovery/sceneRecovery', () => ({ sceneRecovery: {
  isSafeMode: () => mocks.safeMode,
  subscribe: (listener: () => void) => {
    mocks.recoveryListeners.add(listener)
    return () => mocks.recoveryListeners.delete(listener)
  },
} }))

const frame = 'data:image/png;base64,artwork'
const controllers: BrandArtworkController[] = []
const canvas = () => document.createElement('canvas')
async function create(target = canvas(), options: Parameters<typeof createBrandArtworkController>[1] = {}) {
  const controller = await createBrandArtworkController(target, options)
  controllers.push(controller)
  return controller
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.safeMode = false
  mocks.renderListeners.clear()
  mocks.recoveryListeners.clear()
  window.dispatchEvent(new PageTransitionEvent('pageshow'))
  mocks.loadPreset.mockReturnValue({})
  mocks.captureFramePreview.mockResolvedValue(frame)
  mocks.attachMouse.mockReturnValue({ dispose: mocks.mouseDispose, sceneLoaded: mocks.sceneLoaded })
  mocks.initMAGE.mockReturnValue({
    ...mocks,
    subscribeRenderLifecycle: (listener: (event: { type: 'frame' | 'error' }) => void) => {
      mocks.renderListeners.add(listener)
      return () => { mocks.renderListeners.delete(listener); mocks.unsubscribe() }
    },
  })
})
afterEach(() => {
  for (const controller of controllers.splice(0)) { try { controller.dispose() } catch { /* Failure test. */ } }
  vi.restoreAllMocks()
})

describe('fixed brand artwork controller', () => {
  it('loads only the fixed artwork, paused, with preview budgets and viewer mouse interaction', async () => {
    const target = canvas()
    const options = { initialSceneBlob: { shader: 'untrusted' }, sceneKey: 4 }
    const controller = await create(target, { ...options, signal: undefined })
    expect(Object.keys(controller).sort()).toEqual(['captureFramePreview', 'dispose', 'setPlaybackState', 'setSyntheticPreview'])
    expect(mocks.initMAGE).toHaveBeenCalledWith(expect.objectContaining({ canvas: target, autoStart: false,
      renderBudget: expect.objectContaining({ maxRenderPixels: 230400 }), withControls: { active: false, integrated: false } }))
    expect(mocks.loadPreset).toHaveBeenCalledOnce()
    expect(mocks.loadPreset).toHaveBeenCalledWith(BRAND_SCENE.scene)
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadPreset.mock.invocationCallOrder[0])
    expect(mocks.attachMouse).toHaveBeenCalledWith(target, expect.any(Object))
    expect(mocks.sceneLoaded).toHaveBeenCalledOnce()
    expect(mocks.setSyntheticPreview).toHaveBeenLastCalledWith(false, 73, 0.5)
    expect(await controller.captureFramePreview()).toBe(frame)
    controller.setSyntheticPreview(true)
    expect(mocks.setSyntheticPreview).toHaveBeenLastCalledWith(true, 73, 0.5)
    controller.setPlaybackState('playing')
    expect(mocks.start).toHaveBeenCalledTimes(2)
    controller.setPlaybackState('paused')
    expect(mocks.pause).toHaveBeenCalledTimes(2)
  })

  it('bounds captures while preserving their aspect ratio', async () => {
    const target = canvas(); target.width = 4000; target.height = 3000
    const controller = await create(target)
    await controller.captureFramePreview()
    const [{ width, height }] = mocks.captureFramePreview.mock.calls[0]
    expect(width * height).toBeLessThanOrEqual(230400)
    expect(Math.max(width, height)).toBeLessThanOrEqual(640)
    expect(width / height).toBeCloseTo(4 / 3, 2)
  })

  it.each(['abort', 'safe mode', 'navigation'] as const)('allocates no engine when %s already prevents startup', async reason => {
    const abort = new AbortController()
    if (reason === 'abort') abort.abort()
    if (reason === 'safe mode') mocks.safeMode = true
    if (reason === 'navigation') window.dispatchEvent(new PageTransitionEvent('pagehide'))
    await expect(create(canvas(), { signal: abort.signal })).rejects.toThrow()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it.each(['abort', 'safe mode', 'navigation round trip'] as const)('rejects startup interrupted by %s before allocating graphics', async reason => {
    const abort = new AbortController()
    const creating = create(canvas(), { signal: abort.signal })
    if (reason === 'abort') abort.abort()
    if (reason === 'safe mode') mocks.safeMode = true
    if (reason === 'navigation round trip') {
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    }
    await expect(creating).rejects.toThrow()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it.each(['start', 'pointer setup', 'scene load'] as const)('releases allocated graphics if %s fails', async step => {
    if (step === 'start') mocks.start.mockImplementationOnce(() => { throw new Error('start failed') })
    if (step === 'pointer setup') mocks.attachMouse.mockImplementationOnce(() => { throw new Error('pointer failed') })
    if (step === 'scene load') mocks.loadPreset.mockReturnValueOnce(null)
    await expect(create()).rejects.toThrow()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.renderListeners.size).toBe(0)
    expect(mocks.recoveryListeners.size).toBe(0)
    if (step === 'scene load') expect(mocks.mouseDispose).toHaveBeenCalledOnce()
  })

  it.each(['dispose', 'abort', 'navigation', 'safe mode'] as const)('releases resources exactly once on %s without reporting a failure', async reason => {
    const abort = new AbortController(), onError = vi.fn(), target = canvas()
    const controller = await create(target, { signal: abort.signal, onError })
    if (reason === 'dispose') controller.dispose()
    if (reason === 'abort') abort.abort()
    if (reason === 'navigation') window.dispatchEvent(new PageTransitionEvent('pagehide'))
    if (reason === 'safe mode') {
      mocks.safeMode = true
      mocks.recoveryListeners.forEach(listener => listener())
    }
    controller.dispose()
    target.dispatchEvent(new Event('webglcontextlost'))
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.mouseDispose).toHaveBeenCalledOnce()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.renderListeners.size).toBe(0)
    expect(mocks.recoveryListeners.size).toBe(0)
    expect(onError).not.toHaveBeenCalled()
    expect(() => controller.setPlaybackState('playing')).toThrow()
  })

  it.each(['context loss', 'render error'] as const)('stops and reports %s without allowing a late capture to revive it', async reason => {
    const target = canvas(), onError = vi.fn()
    const controller = await create(target, { onError })
    let resolve!: (value: string) => void
    mocks.captureFramePreview.mockReturnValueOnce(new Promise<string>(complete => { resolve = complete }))
    const capture = controller.captureFramePreview()
    if (reason === 'context loss') target.dispatchEvent(new Event('webglcontextlost'))
    else mocks.renderListeners.forEach(listener => listener({ type: 'error' }))
    resolve(frame)
    await expect(capture).resolves.toBeNull()
    expect(onError).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(() => controller.setSyntheticPreview(true)).toThrow()
  })

  it('still disposes the engine and detaches listeners when pointer cleanup throws', async () => {
    const target = canvas(), onError = vi.fn()
    const controller = await create(target, { onError })
    mocks.mouseDispose.mockImplementationOnce(() => { throw new Error('pointer cleanup') })
    expect(() => controller.dispose()).toThrow('pointer cleanup')
    controller.dispose()
    target.dispatchEvent(new Event('webglcontextlost'))
    expect(mocks.dispose).toHaveBeenCalledOnce()
    expect(mocks.renderListeners.size).toBe(0)
    expect(mocks.recoveryListeners.size).toBe(0)
    expect(onError).not.toHaveBeenCalled()
  })
})
