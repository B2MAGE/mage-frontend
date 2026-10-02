import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY } from '@shared/preferences'
import type { MagePlayerController, MagePlayerPlaybackState } from '@modules/player'
import type { DiscoveryScene } from '../types'
import { DiscoverySceneCard } from './DiscoverySceneCard'
import { buildAudioResponseController } from '@shared/test/audioResponseController'

const engineMocks = vi.hoisted(() => ({
  createMagePlayer: vi.fn(),
}))

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
    expect(controller.loadSceneBlob).toHaveBeenCalledWith(scene.sceneData)
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

  it('moves one shared canvas and renderer between scene cards', async () => {
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
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

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)
    expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(secondScene.sceneData)
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, secondScene.sceneId)
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

  it('keeps the poster static for reduced motion and falls back after render errors', async () => {
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

    fireEvent.blur(screen.getByRole('link', { name: /signal bloom/i }))
    fireEvent.focus(screen.getByRole('link', { name: /signal bloom/i }))
    await finishActivation()

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(2)
    expect(healthyController.loadSceneBlob).toHaveBeenCalledWith(scene.sceneData)
    expect(container.querySelector('.scene-card__preview-canvas')).toHaveClass('is-visible')
  })

  it('stops when the page is hidden and disposes the renderer when the last card unmounts', async () => {
    const controller = buildMagePlayerController()
    engineMocks.createMagePlayer.mockResolvedValue(controller)
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

    expect(engineMocks.createMagePlayer).toHaveBeenCalledTimes(1)
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2)
    expect(view.container.querySelector('.scene-card__preview-canvas')).toHaveClass('is-visible')

    view.unmount()
    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })
})
