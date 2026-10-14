import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrandArtworkController, type BrandArtworkController } from '../scene-artwork/brandArtworkController'
import { setAnimatedSceneThumbnailsEnabled } from '@shared/preferences'
import { BrandScene } from '@modules/scene-artwork'
import { AboutScene } from './AboutScene'

const recoveryMocks = vi.hoisted(() => ({
  safeMode: false,
  version: 0,
  listeners: new Set<() => void>(),
}))

vi.mock('@modules/player/recovery/sceneRecovery', () => ({
  sceneRecovery: {
    subscribe: (listener: () => void) => {
      recoveryMocks.listeners.add(listener)
      return () => recoveryMocks.listeners.delete(listener)
    },
    getSnapshot: () => recoveryMocks.version,
    isSafeMode: () => recoveryMocks.safeMode,
  },
}))

function publishRecoveryChange() {
  recoveryMocks.version += 1
  recoveryMocks.listeners.forEach((listener) => listener())
}

async function reportRenderFailure() {
  await act(async () => { vi.mocked(createBrandArtworkController).mock.lastCall?.[1]?.onError?.() })
}

vi.mock('../scene-artwork/brandArtworkController', () => ({ createBrandArtworkController: vi.fn() }))

const label = 'A MAGE scene of gently moving violet and teal rings'
const renderedFrame = 'data:image/png;base64,rendered-frame'
const observe = vi.fn()
const disconnect = vi.fn()
let intersectionCallback: IntersectionObserverCallback
let motionPreference: MediaQueryList
let motionChange: EventListener

function buildController() {
  return {
    captureFramePreview: vi.fn(async (): Promise<string | null> => renderedFrame),
    dispose: vi.fn(),
    setPlaybackState: vi.fn(),
    setSyntheticPreview: vi.fn(),
  } satisfies BrandArtworkController
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function pageTransition(type: 'pagehide' | 'pageshow', persisted = true) {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: persisted })
  window.dispatchEvent(event)
}

async function setIntersecting(isIntersecting: boolean) {
  await act(async () => {
    intersectionCallback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
  })
}

async function setVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibilityState })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
}

async function setReducedMotion(matches: boolean) {
  Object.defineProperty(motionPreference, 'matches', { configurable: true, value: matches })
  await act(async () => { motionChange(new Event('change')) })
}

function illustration() {
  return screen.getByRole('group', { name: label })
}

function canvas() {
  return illustration().querySelector('canvas')!
}

function expectLoading() {
  expect(screen.getByRole('status')).toHaveTextContent('Loading scene preview.')
}

function expectReady() {
  expect(canvas()).toHaveAttribute('data-ready', 'true')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(illustration().querySelector('svg')).not.toBeInTheDocument()
}

describe('AboutScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recoveryMocks.safeMode = false
    recoveryMocks.version += 1
    setAnimatedSceneThumbnailsEnabled(true)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    motionPreference = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn((_event, callback) => { motionChange = callback as EventListener }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => motionPreference))
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersectionCallback = callback }
      observe = observe
      disconnect = disconnect
    })
    vi.mocked(createBrandArtworkController).mockReset()
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('uses the shared loading display until an actual MAGE frame is rendered, without audio or controls', async () => {
    const frame = deferred<string | null>()
    const controller = buildController()
    controller.captureFramePreview.mockReturnValue(frame.promise)
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    const view = render(<AboutScene />)
    const sceneCanvas = canvas()

    expect(observe).toHaveBeenCalledWith(illustration())
    expect(createBrandArtworkController).not.toHaveBeenCalled()
    expectLoading()
    expect(illustration().querySelector('svg')).not.toBeInTheDocument()
    expect(sceneCanvas).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await setIntersecting(true)

    expect(createBrandArtworkController).toHaveBeenCalledWith(sceneCanvas, { signal: expect.any(AbortSignal), onError: expect.any(Function) })
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.captureFramePreview).toHaveBeenCalledTimes(1)
    expect(controller.setPlaybackState.mock.invocationCallOrder[0]).toBeLessThan(controller.captureFramePreview.mock.invocationCallOrder[0])
    expect(sceneCanvas).not.toHaveAttribute('data-ready')
    expectLoading()
    await act(async () => { frame.resolve(renderedFrame) })

    expectReady()
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    view.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(motionPreference.removeEventListener).toHaveBeenCalledWith('change', motionChange)
  })

  it('runs the shared homepage artwork without a synthetic beat or any audio', async () => {
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<BrandScene className="editor-brand-scene" reactToBeat={false} />)
    expectLoading()
    await setIntersecting(true)

    expectReady()
    expect(illustration()).toHaveClass('brand-scene', 'editor-brand-scene')
    expect(canvas()).toHaveClass('brand-scene__canvas')
    expect(createBrandArtworkController).toHaveBeenCalledWith(canvas(), { signal: expect.any(AbortSignal), onError: expect.any(Function) })
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(controller.setSyntheticPreview.mock.calls.every(([enabled]) => enabled === false)).toBe(true)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('pauses and resumes non-reactive artwork without ever enabling the beat', async () => {
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<BrandScene reactToBeat={false} />)
    await setIntersecting(true)
    await setIntersecting(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    await setIntersecting(true)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    await setVisibility('hidden')
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    await setVisibility('visible')
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(controller.setSyntheticPreview.mock.calls.every(([enabled]) => enabled === false)).toBe(true)
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)
  })

  it.each(['disabled animation', 'reduced motion'] as const)('renders a real static homepage frame with %s', async (preference) => {
    if (preference === 'disabled animation') setAnimatedSceneThumbnailsEnabled(false)
    else Object.defineProperty(motionPreference, 'matches', { configurable: true, value: true })
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<BrandScene reactToBeat={false} />)
    await setIntersecting(true)

    expectReady()
    expect(controller.captureFramePreview).toHaveBeenCalledTimes(1)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(controller.setSyntheticPreview.mock.calls.every(([enabled]) => enabled === false)).toBe(true)
  })

  it('renders a real static frame when animated previews are disabled', async () => {
    setAnimatedSceneThumbnailsEnabled(false)
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    expectLoading()
    expect(createBrandArtworkController).not.toHaveBeenCalled()
    await setIntersecting(true)

    expectReady()
    expect(controller.captureFramePreview).toHaveBeenCalledTimes(1)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
  })

  it('renders a static frame for reduced motion and responds to changes using the same renderer', async () => {
    Object.defineProperty(motionPreference, 'matches', { configurable: true, value: true })
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setIntersecting(true)
    expectReady()
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')

    await setReducedMotion(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    await setReducedMotion(true)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)
    expect(controller.captureFramePreview).toHaveBeenCalledTimes(1)
  })

  it('starts only in a visible tab, pauses offscreen or hidden, and resumes the same renderer', async () => {
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setVisibility('hidden')
    await setIntersecting(true)
    expect(createBrandArtworkController).not.toHaveBeenCalled()

    await setVisibility('visible')
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    await setIntersecting(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    await setIntersecting(true)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    await setVisibility('hidden')
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    await setVisibility('visible')
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)
    expect(controller.captureFramePreview).toHaveBeenCalledTimes(1)
  })

  it('uses fresh canvases and real rendered frames when animation is disabled and re-enabled', async () => {
    const animatedController = buildController()
    const staticController = buildController()
    const resumedController = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValueOnce(animatedController).mockResolvedValueOnce(staticController).mockResolvedValueOnce(resumedController)
    render(<AboutScene />)
    const originalCanvas = canvas()
    await setIntersecting(true)
    await act(async () => { setAnimatedSceneThumbnailsEnabled(false) })

    expect(animatedController.dispose).toHaveBeenCalledTimes(1)
    const staticCanvas = canvas()
    expect(staticCanvas).not.toBe(originalCanvas)
    expectLoading()
    await setIntersecting(true)
    expect(createBrandArtworkController).toHaveBeenLastCalledWith(staticCanvas, { signal: expect.any(AbortSignal), onError: expect.any(Function) })
    expectReady()
    expect(staticController.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(staticController.setPlaybackState).not.toHaveBeenCalledWith('playing')

    await act(async () => { setAnimatedSceneThumbnailsEnabled(true) })
    expect(staticController.dispose).toHaveBeenCalledTimes(1)
    const resumedCanvas = canvas()
    expect(resumedCanvas).not.toBe(staticCanvas)
    await setIntersecting(true)
    expect(createBrandArtworkController).toHaveBeenLastCalledWith(resumedCanvas, { signal: expect.any(AbortSignal), onError: expect.any(Function) })
    expectReady()
    expect(resumedController.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(createBrandArtworkController).toHaveBeenCalledTimes(3)
  })

  it('cancels startup on unmount and disposes a late renderer without capturing it', async () => {
    const creation = deferred<BrandArtworkController>()
    vi.mocked(createBrandArtworkController).mockReturnValue(creation.promise)
    const view = render(<AboutScene />)
    await setIntersecting(true)
    view.unmount()
    expect(vi.mocked(createBrandArtworkController).mock.lastCall?.[1]?.signal?.aborted).toBe(true)
    const controller = buildController()
    await act(async () => { creation.resolve(controller) })

    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(controller.captureFramePreview).not.toHaveBeenCalled()
    expect(controller.setPlaybackState).not.toHaveBeenCalled()
  })

  it('ignores a rendered frame that arrives after unmount', async () => {
    const frame = deferred<string | null>()
    const controller = buildController()
    controller.captureFramePreview.mockReturnValue(frame.promise)
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    const view = render(<AboutScene />)
    const sceneCanvas = canvas()
    await setIntersecting(true)
    view.unmount()
    await act(async () => { frame.resolve(renderedFrame) })

    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(sceneCanvas).not.toHaveAttribute('data-ready')
    expect(sceneCanvas).not.toBeInTheDocument()
  })

  it.each(['offscreen', 'hidden', 'reduced motion'] as const)('keeps a late-created renderer paused if it became %s before loading', async (reason) => {
    const creation = deferred<BrandArtworkController>()
    vi.mocked(createBrandArtworkController).mockReturnValue(creation.promise)
    render(<AboutScene />)
    await setIntersecting(true)
    if (reason === 'offscreen') await setIntersecting(false)
    if (reason === 'hidden') await setVisibility('hidden')
    if (reason === 'reduced motion') await setReducedMotion(true)
    const controller = buildController()
    await act(async () => { creation.resolve(controller) })

    expectReady()
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
  })

  it.each(['offscreen', 'hidden', 'reduced motion'] as const)('can show a real captured frame without playing after becoming %s during capture', async (reason) => {
    const frame = deferred<string | null>()
    const controller = buildController()
    controller.captureFramePreview.mockReturnValue(frame.promise)
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setIntersecting(true)
    if (reason === 'offscreen') await setIntersecting(false)
    if (reason === 'hidden') await setVisibility('hidden')
    if (reason === 'reduced motion') await setReducedMotion(true)
    await act(async () => { frame.resolve(renderedFrame) })

    expectReady()
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    if (reason === 'offscreen') await setIntersecting(true)
    if (reason === 'hidden') await setVisibility('visible')
    if (reason === 'reduced motion') await setReducedMotion(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
  })

  it('does not start playback while capture is still pending even after visibility changes', async () => {
    const frame = deferred<string | null>()
    const controller = buildController()
    controller.captureFramePreview.mockReturnValue(frame.promise)
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setIntersecting(true)
    await setIntersecting(false)
    await setIntersecting(true)
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expectLoading()
    await act(async () => { frame.resolve(renderedFrame) })
    expectReady()
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
  })

  it.each(['creation', 'capture', 'empty capture'] as const)('shows an error instead of an artificial fallback if %s fails', async (failure) => {
    const controller = buildController()
    if (failure === 'creation') {
      vi.mocked(createBrandArtworkController).mockRejectedValue(new Error('WebGL is unavailable'))
    } else {
      if (failure === 'capture') controller.captureFramePreview.mockRejectedValue(new Error('Capture failed'))
      if (failure === 'empty capture') controller.captureFramePreview.mockResolvedValue(null)
      vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    }
    render(<AboutScene />)
    await setIntersecting(true)

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to render this scene.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(illustration().querySelector('svg')).not.toBeInTheDocument()
    expect(canvas()).not.toHaveAttribute('data-ready')
    expect(controller.dispose).toHaveBeenCalledTimes(failure === 'creation' ? 0 : 1)
    await setIntersecting(false)
    await setIntersecting(true)
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)
  })

  it('shows a local error and releases the renderer if WebGL loses its context', async () => {
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setIntersecting(true)
    expectReady()
    await reportRenderFailure()

    expect(canvas()).not.toHaveAttribute('data-ready')
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to render this scene.')
    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('ignores a captured frame after context loss instead of replacing the error with a ready canvas', async () => {
    const frame = deferred<string | null>()
    const controller = buildController()
    controller.captureFramePreview.mockReturnValue(frame.promise)
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<AboutScene />)
    await setIntersecting(true)
    await reportRenderFailure()
    await act(async () => { frame.resolve(renderedFrame) })

    expect(canvas()).not.toHaveAttribute('data-ready')
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to render this scene.')
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not create decorative artwork in safe mode', () => {
    recoveryMocks.safeMode = true
    render(<BrandScene />)
    expect(createBrandArtworkController).not.toHaveBeenCalled()
    expect(canvas()).toBeNull()
    expect(illustration()).toHaveAttribute('data-preview-paused', 'true')
    expect(illustration()).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('releases live artwork when safe mode starts without remounting on unrelated recovery updates', async () => {
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValue(controller)
    render(<BrandScene />)
    await setIntersecting(true)
    expectReady()
    await act(async () => {
      recoveryMocks.safeMode = true
      publishRecoveryChange()
    })
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(canvas()).toBeNull()
    await act(async () => { publishRecoveryChange() })
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)
  })

  it('disposes artwork that finishes initialization after safe mode starts without capturing it', async () => {
    const creation = deferred<BrandArtworkController>()
    const controller = buildController()
    vi.mocked(createBrandArtworkController).mockReturnValue(creation.promise)
    render(<BrandScene />)
    await setIntersecting(true)
    await act(async () => {
      recoveryMocks.safeMode = true
      publishRecoveryChange()
      creation.resolve(controller)
    })

    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(controller.captureFramePreview).not.toHaveBeenCalled()
    expect(canvas()).toBeNull()
  })

  it('recreates the artwork after BFCache restoration without reporting intentional disposal as an error', async () => {
    const first = buildController()
    const restored = buildController()
    vi.mocked(createBrandArtworkController).mockResolvedValueOnce(first).mockResolvedValueOnce(restored)
    render(<BrandScene reactToBeat={false} />)
    await setIntersecting(true)
    const originalCanvas = canvas()
    await act(async () => { pageTransition('pageshow', false) })
    expect(createBrandArtworkController).toHaveBeenCalledTimes(1)

    await act(async () => {
      pageTransition('pagehide')
      // Controller pagehide cleanup intentionally loses the WebGL context.
      originalCanvas.dispatchEvent(new Event('webglcontextlost'))
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => { pageTransition('pageshow') })
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(canvas()).not.toBe(originalCanvas)
    expectLoading()
    await setIntersecting(true)

    expectReady()
    expect(restored.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(restored.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(createBrandArtworkController).toHaveBeenCalledTimes(2)
  })

  it('recreates after BFCache interrupts initialization and discards the old result', async () => {
    const pending = deferred<BrandArtworkController>()
    const stale = buildController()
    const restored = buildController()
    vi.mocked(createBrandArtworkController).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(restored)
    render(<BrandScene />)
    await setIntersecting(true)
    await act(async () => {
      pageTransition('pagehide')
      pageTransition('pageshow')
    })
    await setIntersecting(true)
    await act(async () => { pending.resolve(stale) })

    expect(stale.dispose).toHaveBeenCalledTimes(1)
    expect(stale.captureFramePreview).not.toHaveBeenCalled()
    expectReady()
  })
})
