import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY } from '@shared/preferences'
import type { MagePlayerController, MagePlayerPlaybackState } from '@modules/player'
import type { DiscoveryScene } from '../types'
import { DiscoverySceneCard } from './DiscoverySceneCard'
import { buildAudioResponseController } from '@shared/test/audioResponseController'
import { sceneRecoveryKey } from '@modules/player'

const engineMocks = vi.hoisted(() => ({
  createMagePlayer: vi.fn(),
}))

const recoveryMocks = vi.hoisted(() => ({
  safeMode: false,
  version: 0,
  blocks: new Set<string>(),
  retryGrants: new Set<string>(),
  listeners: new Set<() => void>(),
}))

vi.mock('@modules/player/recovery/sceneRecovery', () => ({
  sceneRecoveryKey: (blob: unknown, id?: string | number) => `${id ?? 'draft'}:${JSON.stringify(blob)}`,
  sceneRecovery: {
    subscribe: (listener: () => void) => {
      recoveryMocks.listeners.add(listener)
      return () => recoveryMocks.listeners.delete(listener)
    },
    getSnapshot: () => recoveryMocks.version,
    isSafeMode: () => recoveryMocks.safeMode,
    getBlock: (key: string) => !recoveryMocks.retryGrants.has(key) && recoveryMocks.blocks.has(key) ? { reason: 'render-failure', at: 0 } : null,
    getAutomaticBlock: (key: string) => recoveryMocks.blocks.has(key) ? { reason: 'render-failure', at: 0 } : null,
  },
}))

function publishRecoveryChange() {
  recoveryMocks.version += 1
  recoveryMocks.listeners.forEach((listener) => listener())
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

vi.mock('@modules/player/infrastructure/engineAdapter', () => ({
  createMagePlayer: engineMocks.createMagePlayer,
}))

const scene: DiscoveryScene = {
  sceneId: 17,
  ownerUserId: 4,
  creatorDisplayName: 'Ari Rivera',
  name: 'Signal Bloom',
  description: 'A reactive scene.',
  sceneData: { visualizer: { shader: 'signal' } },
  thumbnailRef: 'https://example.com/signal-bloom.png',
  createdAt: '2026-09-28T12:00:00Z',
  engagement: {
    views: 18,
    upvotes: 4,
    downvotes: 0,
    saves: 2,
    currentUserVote: null,
    currentUserSaved: false,
  },
}

const emptyAudioState = {
  currentTime: 0,
  duration: 0,
  hasSource: false,
  isLoaded: false,
  sourcePath: null,
  volume: 1,
}

function buildMagePlayerController(
  overrides: Partial<MagePlayerController> = {},
): MagePlayerController {
  let playbackState: MagePlayerPlaybackState = 'playing'

  return {
    ...buildAudioResponseController(),
    captureFramePreview: vi.fn(async () => null),
    clearAudio: vi.fn(() => emptyAudioState),
    dispose: vi.fn(),
    getAudioState: vi.fn(() => emptyAudioState),
    getPlaybackState: vi.fn(() => playbackState),
    loadAudio: vi.fn(async () => emptyAudioState),
    loadSceneBlob: vi.fn(),
    resetPlayback: vi.fn(() => 'paused' as const),
    seekAudio: vi.fn(() => emptyAudioState),
    setAudioVolume: vi.fn(() => emptyAudioState),
    setPlaybackState: vi.fn((nextState) => {
      playbackState = nextState
      return playbackState
    }),
    setSyntheticPreview: vi.fn(),
    ...overrides,
  }
}

let reducedMotion = false
let finePointer = true

function mediaQueryList(query: string): MediaQueryList {
  return {
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : finePointer,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

function renderCard(nextScene: DiscoveryScene = scene) {
  return render(
    <MemoryRouter>
      <DiscoverySceneCard scene={nextScene} />
    </MemoryRouter>,
  )
}

async function finishActivation() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
  })
}

describe('DiscoverySceneCard animated preview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reducedMotion = false
    finePointer = true
    recoveryMocks.safeMode = false
    recoveryMocks.blocks.clear()
    recoveryMocks.retryGrants.clear()
    recoveryMocks.version += 1
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(mediaQueryList),
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) =>
      window.clearTimeout(handle),
    )
    engineMocks.createMagePlayer.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits 300ms, preserves the poster, and crossfades a decorative synthetic preview', async () => {
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
    const { container } = renderCard()
    const link = screen.getByRole('link', { name: /signal bloom/i })

    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()

    await finishActivation()

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)
    expect(controller.loadSceneBlob).toHaveBeenCalledWith(scene.sceneData, { sceneKey: scene.sceneId })
    expect(controller.setSyntheticPreview).toHaveBeenCalledWith(true, scene.sceneId)
    expect(screen.getByAltText('Thumbnail for Signal Bloom')).toBeInTheDocument()
    const canvas = container.querySelector('.scene-card__preview-canvas')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('tabindex', '-1')
    expect(canvas).toHaveClass('is-visible')
  })

  it('cancels fly-by hovers and still previews keyboard focus on coarse pointers', async () => {
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
    renderCard()
    const link = screen.getByRole('link', { name: /signal bloom/i })

    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    fireEvent.pointerLeave(link, { pointerType: 'mouse' })
    await finishActivation()
    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()

    finePointer = false
    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    await finishActivation()
    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()

    fireEvent.focus(link)
    await finishActivation()
    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)
  })

  it('disposes a completed hover before rendering another card with its own recovery identity', async () => {
    const firstController = buildMagePlayerController()
    const secondController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValueOnce(firstController).mockResolvedValueOnce(secondController)
    const secondScene = {
      ...scene,
      sceneId: 18,
      name: 'Second Signal',
      sceneData: { visualizer: { shader: 'second' } },
    }
    const { container } = render(
      <MemoryRouter>
        <DiscoverySceneCard scene={scene} />
        <DiscoverySceneCard scene={secondScene} />
      </MemoryRouter>,
    )
    const firstLink = screen.getByRole('link', { name: /signal bloom/i })
    const secondLink = screen.getByRole('link', { name: /second signal/i })

    fireEvent.pointerEnter(firstLink, { pointerType: 'mouse' })
    await finishActivation()
    fireEvent.pointerLeave(firstLink, { pointerType: 'mouse' })
    fireEvent.pointerEnter(secondLink, { pointerType: 'mouse' })
    await finishActivation()

    expect(firstController.dispose).toHaveBeenCalledTimes(1)
    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(2)
    expect(secondController.loadSceneBlob).toHaveBeenLastCalledWith(secondScene.sceneData, { sceneKey: secondScene.sceneId })
    expect(secondController.setSyntheticPreview).toHaveBeenLastCalledWith(true, secondScene.sceneId)
    expect(container.querySelectorAll('.scene-card__preview-canvas')).toHaveLength(1)
  })

  it('does not create a renderer when animated thumbnails are disabled', async () => {
    window.localStorage.setItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY, 'false')
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
    renderCard()

    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()

    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()
  })

  it('keeps the poster static for reduced motion and never automatically retries a failed scene', async () => {
    reducedMotion = true
    const reducedController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(reducedController)
    const reducedRender = renderCard()
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()
    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()
    reducedRender.unmount()

    reducedMotion = false
    const failedController = buildMagePlayerController({
      loadSceneBlob: vi.fn(() => {
        recoveryMocks.blocks.add(sceneRecoveryKey(scene.sceneData, scene.sceneId)!)
        publishRecoveryChange()
        throw new Error('Shader failed')
      }),
    })
    const healthyController = buildMagePlayerController()
    engineMocks.createMagePlayer
      .mockResolvedValueOnce(failedController)
      .mockResolvedValueOnce(healthyController)
    const { container } = renderCard()
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()

    expect(screen.getByAltText('Thumbnail for Signal Bloom')).toBeInTheDocument()
    expect(container.querySelector('.scene-card__preview-canvas')).not.toBeInTheDocument()
    expect(failedController.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Preview paused. Open scene to retry.')).toBeInTheDocument()

    fireEvent.blur(screen.getByRole('link', { name: /signal bloom/i }))
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)
    expect(healthyController.loadSceneBlob).not.toHaveBeenCalled()
    expect(container.querySelector('.scene-card__preview-canvas')).not.toBeInTheDocument()
  })

  it('disposes on visibility loss and creates a fresh renderer only after visibility returns', async () => {
    const controller = buildMagePlayerController()
    const resumedController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValueOnce(controller).mockResolvedValueOnce(resumedController)
    const view = renderCard()
    const link = screen.getByRole('link', { name: /signal bloom/i })

    fireEvent.focus(link)
    await finishActivation()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    const fadingCanvas = view.container.querySelector('.scene-card__preview-canvas')
    expect(fadingCanvas).not.toHaveClass('is-visible')
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(controller.dispose).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(179)
    })
    expect(fadingCanvas).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fadingCanvas).not.toBeInTheDocument()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await finishActivation()

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(2)
    expect(resumedController.loadSceneBlob).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('.scene-card__preview-canvas')).toHaveClass('is-visible')

    view.unmount()
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(resumedController.dispose).toHaveBeenCalledTimes(1)
  })

  it.each(['blocked scene', 'safe mode'] as const)('shows the existing thumbnail without creating an engine for %s', async (reason) => {
    if (reason === 'safe mode') recoveryMocks.safeMode = true
    else recoveryMocks.blocks.add(sceneRecoveryKey(scene.sceneData, scene.sceneId)!)
    renderCard()
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()

    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()
    expect(screen.getByAltText('Thumbnail for Signal Bloom')).toBeInTheDocument()
    expect(screen.getByText('Preview paused. Open scene to retry.')).toBeInTheDocument()
  })

  it('disposes a pending renderer when safe mode starts and waits for another interaction after it ends', async () => {
    const creation = deferred<MagePlayerController>()
    const lateController = buildMagePlayerController()
    const nextController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockReturnValueOnce(creation.promise).mockResolvedValueOnce(nextController)
    renderCard()
    const link = screen.getByRole('link', { name: /signal bloom/i })
    fireEvent.focus(link)
    await finishActivation()

    await act(async () => {
      recoveryMocks.safeMode = true
      publishRecoveryChange()
      creation.resolve(lateController)
    })
    expect(lateController.dispose).toHaveBeenCalledTimes(1)
    expect(lateController.loadSceneBlob).not.toHaveBeenCalled()
    await act(async () => {
      recoveryMocks.safeMode = false
      publishRecoveryChange()
    })
    await finishActivation()
    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)

    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    await finishActivation()
    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(2)
    expect(nextController.loadSceneBlob).toHaveBeenCalledWith(scene.sceneData, { sceneKey: scene.sceneId })
  })

  it('leaves a deliberate retry grant for its player while automatic previews stay blocked', async () => {
    const key = sceneRecoveryKey(scene.sceneData, scene.sceneId)!
    recoveryMocks.blocks.add(key)
    const controller = buildMagePlayerController({ loadSceneBlob: vi.fn(() => { recoveryMocks.retryGrants.delete(key) }) })
    engineMocks.createMagePlayer.mockResolvedValue(controller)
    renderCard()
    await act(async () => {
      recoveryMocks.retryGrants.add(key)
      publishRecoveryChange()
    })
    const link = screen.getByRole('link', { name: /signal bloom/i })
    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    fireEvent.focus(link)
    await finishActivation()

    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()
    expect(controller.loadSceneBlob).not.toHaveBeenCalled()
    expect(recoveryMocks.retryGrants.has(key)).toBe(true)
    expect(screen.getByText('Preview paused. Open scene to retry.')).toBeInTheDocument()
  })

  it('lets a corrected revision preview without reviving the blocked revision of the same scene', async () => {
    recoveryMocks.blocks.add(sceneRecoveryKey(scene.sceneData, scene.sceneId)!)
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
    const view = renderCard()
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()
    expect(engineMocks.createMagePlayer).not.toHaveBeenCalled()

    const correctedScene = { ...scene, sceneData: { visualizer: { shader: 'corrected' } } }
    view.rerender(<MemoryRouter><DiscoverySceneCard scene={correctedScene} /></MemoryRouter>)
    fireEvent.pointerEnter(screen.getByRole('link', { name: /signal bloom/i }), { pointerType: 'mouse' })
    await finishActivation()

    expect(controller.loadSceneBlob).toHaveBeenCalledWith(correctedScene.sceneData, { sceneKey: scene.sceneId })
    expect(recoveryMocks.blocks.has(sceneRecoveryKey(scene.sceneData, scene.sceneId)!)).toBe(true)
    expect(screen.queryByText('Preview paused. Open scene to retry.')).not.toBeInTheDocument()
  })

  it('disposes stale asynchronous creation without disturbing the next card preview', async () => {
    const firstCreation = deferred<MagePlayerController>()
    const firstController = buildMagePlayerController()
    const nextController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockReturnValueOnce(firstCreation.promise).mockResolvedValueOnce(nextController)
    const nextScene = { ...scene, sceneId: 18, name: 'Second Signal' }
    const { container } = render(<MemoryRouter><DiscoverySceneCard scene={scene} /><DiscoverySceneCard scene={nextScene} /></MemoryRouter>)
    const firstLink = screen.getByRole('link', { name: /signal bloom/i })
    fireEvent.pointerEnter(firstLink, { pointerType: 'mouse' })
    await finishActivation()
    fireEvent.pointerLeave(firstLink, { pointerType: 'mouse' })
    fireEvent.pointerEnter(screen.getByRole('link', { name: /second signal/i }), { pointerType: 'mouse' })
    await finishActivation()
    await act(async () => { firstCreation.resolve(firstController) })

    expect(firstController.dispose).toHaveBeenCalledTimes(1)
    expect(firstController.loadSceneBlob).not.toHaveBeenCalled()
    expect(nextController.dispose).not.toHaveBeenCalled()
    expect(nextController.loadSceneBlob).toHaveBeenCalledWith(nextScene.sceneData, { sceneKey: nextScene.sceneId })
    expect(container.querySelectorAll('.scene-card__preview-canvas')).toHaveLength(1)
    expect(container.querySelector('.scene-card__preview-canvas')).toHaveClass('is-visible')
  })

  it('keeps recovery controls and other cards working even if renderer cleanup throws', async () => {
    const failedController = buildMagePlayerController({ dispose: vi.fn(() => { throw new Error('Cleanup failed') }) })
    const nextController = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValueOnce(failedController).mockResolvedValueOnce(nextController)
    const nextScene = { ...scene, sceneId: 18, name: 'Second Signal' }
    render(<MemoryRouter><DiscoverySceneCard scene={scene} /><DiscoverySceneCard scene={nextScene} /></MemoryRouter>)
    fireEvent.pointerEnter(screen.getByRole('link', { name: /signal bloom/i }), { pointerType: 'mouse' })
    await finishActivation()
    await act(async () => {
      recoveryMocks.blocks.add(sceneRecoveryKey(scene.sceneData, scene.sceneId)!)
      publishRecoveryChange()
    })

    expect(screen.getByText('Preview paused. Open scene to retry.')).toBeInTheDocument()
    expect(failedController.dispose).toHaveBeenCalledTimes(1)
    fireEvent.pointerEnter(screen.getByRole('link', { name: /second signal/i }), { pointerType: 'mouse' })
    await finishActivation()
    expect(nextController.loadSceneBlob).toHaveBeenCalledWith(nextScene.sceneData, { sceneKey: nextScene.sceneId })
  })
})
