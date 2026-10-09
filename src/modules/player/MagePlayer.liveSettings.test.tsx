import { customDocument } from '@shared/test/sceneDocument'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerAudioState, type MageSceneBlob } from './infrastructure/engineAdapter'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const custom = buildMagePlayerSceneBlob()
const fixtures = [
  { name: 'current custom', initial: custom, next: customDocument({ ...custom.scene, intent: { fov: 96, autoRotateSpeed: 0.8 },
    fx: { bloom: { enabled: true, strength: 0.4 }, passes: { rgbShift: true } } }) },
  { name: 'template', initial: template, next: { ...template, settings: { camera: { fov: 96, orbitSpeed: 0.8 },
    bloom: { enabled: true, strength: 0.4 }, effects: { passes: { rgbShift: true } } } } },
]

describe('MagePlayer live scene settings', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(createMagePlayer).mockReset() })
  afterEach(() => vi.restoreAllMocks())

  it.each(fixtures)('updates $name camera and effects without loading, recreating or disturbing selected audio', async ({ initial, next }) => {
    const controller = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const tracks = [buildMagePlayerTrack()]
    const view = render(<MagePlayer sceneBlob={initial} sceneKey="editor" playlistTracks={tracks} selectedTrackId="track-1" />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByRole('slider', { name: /seek scene audio/i }), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: /adjust audio volume/i }))
    fireEvent.change(screen.getByRole('slider', { name: /audio volume/i }), { target: { value: '0.4' } })
    const host = view.container.querySelector('.mage-player__render-host')
    vi.mocked(controller.clearAudio).mockClear()
    vi.mocked(controller.setPlaybackState).mockClear()
    vi.mocked(controller.seekAudio).mockClear()
    vi.mocked(controller.setAudioVolume).mockClear()

    view.rerender(<MagePlayer sceneBlob={next} sceneKey="editor" playlistTracks={tracks} selectedTrackId="track-1" />)

    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(view.container.querySelector('.mage-player')).toHaveAttribute('data-state', 'ready')
    await waitFor(() => expect(controller.updateSceneSettings).toHaveBeenCalledExactlyOnceWith(next, { sceneKey: 'editor' }))
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(controller.dispose).not.toHaveBeenCalled()
    expect(view.container.querySelector('.mage-player__render-host')).toBe(host)
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(controller.clearAudio).not.toHaveBeenCalled()
    expect(controller.resetPlayback).not.toHaveBeenCalled()
    expect(controller.setPlaybackState).not.toHaveBeenCalled()
    expect(controller.seekAudio).not.toHaveBeenCalled()
    expect(controller.setAudioVolume).not.toHaveBeenCalled()
    expect(controller.setAudioResponseSettings).not.toHaveBeenCalled()
    expect(screen.getByText('0:42')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /track 1\/1: track-one.mp3/i })).toBeInTheDocument()
  })

  it('keeps rapid final settings, local music and a deliberately paused scene ready for capture', async () => {
    const controller = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const captureChanged = vi.fn()
    const view = render(<MagePlayer sceneBlob={custom} sceneKey="editor" onCaptureFramePreviewChange={captureChanged} />)
    await screen.findByRole('button', { name: /add audio tracks/i })
    await userEvent.setup().upload(view.container.querySelector('input[type=file]') as HTMLInputElement,
      new File(['audio'], 'local-song.mp3', { type: 'audio/mpeg' }))
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /pause scene and audio playback/i }))
    fireEvent.change(screen.getByRole('slider', { name: /seek scene audio/i }), { target: { value: '23' } })
    vi.mocked(controller.clearAudio).mockClear()
    vi.mocked(controller.setPlaybackState).mockClear()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    let latest: MageSceneBlob = custom
    for (let index = 0; index < 16; index++) {
      latest = customDocument({ ...custom.scene, intent: { fov: 75 + index }, fx: { bloom: { enabled: true, strength: index / 20 } } })
      view.rerender(<MagePlayer sceneBlob={latest} sceneKey="editor" onCaptureFramePreviewChange={captureChanged} />)
      expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    }
    await waitFor(() => expect(controller.updateSceneSettings).toHaveBeenLastCalledWith(latest, { sceneKey: 'editor' }))
    expect(controller.updateSceneSettings).toHaveBeenCalledTimes(16)
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(controller.clearAudio).not.toHaveBeenCalled()
    expect(controller.resetPlayback).not.toHaveBeenCalled()
    expect(controller.setPlaybackState).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /play scene and audio playback/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /track 1\/1: local-song.mp3/i })).toBeInTheDocument()
    expect(screen.getByText('0:23')).toBeInTheDocument()
    const capture = captureChanged.mock.calls.at(-1)![0] as () => Promise<string | null>
    await expect(capture()).resolves.toMatch(/^data:image\/png;base64,/)
    expect(controller.captureFramePreview).toHaveBeenCalledOnce()
    expect(vi.mocked(controller.updateSceneSettings!).mock.invocationCallOrder.at(-1))
      .toBeLessThan(vi.mocked(controller.captureFramePreview!).mock.invocationCallOrder[0])
  })

  it('fully reloads a restored scene while a replacement scene is still loading', async () => {
    let finishReplacement!: () => void
    const replacement = buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.5);' } })
    const controller = buildMagePlayerController({
      updateSceneSettings: vi.fn(() => { throw new Error('Load a scene before updating its settings.') }),
      loadSceneBlob: vi.fn(scene => scene === replacement
        ? new Promise<void>(resolve => { finishReplacement = resolve })
        : undefined),
    })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const view = render(<MagePlayer sceneBlob={custom} sceneKey="editor" />)
    await waitFor(() => expect(view.container.querySelector('.mage-player')).toHaveAttribute('data-state', 'ready'))

    view.rerender(<MagePlayer sceneBlob={replacement} sceneKey="editor" />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2))
    view.rerender(<MagePlayer sceneBlob={custom} sceneKey="editor" />)

    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(3))
    expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(custom, { sceneKey: 'editor' })
    expect(controller.updateSceneSettings).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => finishReplacement())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    { name: 'shader source', next: buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.5);' } }), nextKey: 'editor' },
    { name: 'skybox', next: buildMagePlayerSceneBlob({ visualizer: { skyboxPreset: 2 } }), nextKey: 'editor' },
    { name: 'starting time', next: buildMagePlayerSceneBlob({ state: { time: 12 } }), nextKey: 'editor' },
    { name: 'route', next: custom, nextKey: 'other-scene' },
  ])('fully loads a changed $name even when live settings are supported', async ({ next, nextKey }) => {
    let finish!: () => void
    const controller = buildMagePlayerController({ updateSceneSettings: vi.fn(), loadSceneBlob: vi.fn()
      .mockImplementationOnce(() => undefined).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const view = render(<MagePlayer sceneBlob={custom} sceneKey="editor" />)
    await waitFor(() => expect(view.container.querySelector('.mage-player')).toHaveAttribute('data-state', 'ready'))
    view.rerender(<MagePlayer sceneBlob={next} sceneKey={nextKey} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(next, { sceneKey: nextKey }))
    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()
    expect(controller.updateSceneSettings).not.toHaveBeenCalled()
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2)
    expect(createMagePlayer).toHaveBeenCalledOnce()
    await act(async () => finish())
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
  })

  it('keeps a pending audio decode alive while applying live camera settings', async () => {
    let complete!: (state: MagePlayerAudioState) => void
    const controller = buildMagePlayerController({ updateSceneSettings: vi.fn(),
      loadAudio: vi.fn(() => new Promise<MagePlayerAudioState>(resolve => { complete = resolve })) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const tracks = [buildMagePlayerTrack()]
    const view = render(<MagePlayer sceneBlob={custom} playlistTracks={tracks} selectedTrackId="track-1" />)
    await screen.findByText('Loading track…')
    const next = customDocument({ ...custom.scene, intent: { fov: 96 } })
    view.rerender(<MagePlayer sceneBlob={next} playlistTracks={tracks} selectedTrackId="track-1" />)
    expect(controller.updateSceneSettings).toHaveBeenCalledWith(next, { sceneKey: undefined })
    expect(screen.getByText('Loading track…')).toBeInTheDocument()
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    await act(async () => complete({ currentTime: 0, duration: 185, hasSource: true, isLoaded: true, sourcePath: 'blob:track-one', volume: 1 }))
    await waitFor(() => expect(screen.queryByText('Loading track…')).not.toBeInTheDocument())
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
  })

  it('passes the original recovery document alongside live preview defaults', async () => {
    const controller = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const view = render(<MagePlayer sceneBlob={custom} recoverySceneBlob={custom} sceneKey="editor" />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    const saved = customDocument({ ...custom.scene, intent: { fov: 96 } })
    const preview = customDocument({ ...saved.scene, audioResponse: 'mapped-v1' })
    view.rerender(<MagePlayer sceneBlob={preview} recoverySceneBlob={saved} sceneKey="editor" />)
    await waitFor(() => expect(controller.updateSceneSettings).toHaveBeenCalledExactlyOnceWith(preview, { sceneKey: 'editor', recoverySceneBlob: saved }))
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(controller.setAudioResponseSettings).not.toHaveBeenCalled()
  })
})
