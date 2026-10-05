import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer } from './infrastructure/engineAdapter'
import { parseSceneDocument } from './templates/sceneContract'
import {
  buildMagePlayerController,
  buildMagePlayerSceneBlob,
} from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

describe('MagePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for isolated scene loading and ignores completion from a superseded scene', async () => {
    let completeFirst!: () => void
    let completeSecond!: () => void
    const controller = buildMagePlayerController({ loadSceneBlob: vi.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => { completeFirst = resolve }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { completeSecond = resolve })) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const captureChanged = vi.fn()
    const first = buildMagePlayerSceneBlob()
    const second = buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.4);' } })
    const view = render(<MagePlayer sceneBlob={first} onCaptureFramePreviewChange={captureChanged} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()
    expect(captureChanged).not.toHaveBeenCalledWith(expect.any(Function))
    view.rerender(<MagePlayer sceneBlob={second} onCaptureFramePreviewChange={captureChanged} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2))
    completeFirst()
    await Promise.resolve()
    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()
    completeSecond()
    await waitFor(() => expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument())
    expect(captureChanged).toHaveBeenCalledWith(expect.any(Function))
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('keeps an in-flight capture valid through a callback-only rerender', async () => {
    let finish!: (value: string) => void
    const controller = buildMagePlayerController({ captureFramePreview: vi.fn(() => new Promise<string>(resolve => { finish = resolve })) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const firstCallback = vi.fn(), nextCallback = vi.fn()
    const view = render(<MagePlayer sceneBlob={scene} onCaptureFramePreviewChange={firstCallback} />)
    await waitFor(() => expect(firstCallback).toHaveBeenCalledWith(expect.any(Function)))
    const pending = firstCallback.mock.calls.at(-1)![0]()
    view.rerender(<MagePlayer sceneBlob={scene} onCaptureFramePreviewChange={nextCallback} />)
    finish('data:image/png;base64,cHJldmlldw==')
    await expect(pending).resolves.toBe('data:image/png;base64,cHJldmlldw==')
  })

  it('loads a scene blob and disposes the engine on unmount', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()
    const { unmount } = render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()

    await waitFor(() => {
      expect(createMagePlayer).toHaveBeenCalledTimes(1)
      expect(createMagePlayer).toHaveBeenCalledWith(expect.any(HTMLDivElement), {
        log: false, renderProfile: 'full', initialSceneBlob: sceneBlob, mouseInteractions: true, mouseWheelZoom: true,
        signal: expect.any(AbortSignal),
      })
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })

    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause scene and audio playback/i })).toHaveAccessibleName(
      'Pause scene and audio playback',
    )
    expect(screen.getByRole('button', { name: /add audio tracks/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /shuffle playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repeat playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset scene and audio playback/i })).not.toBeInTheDocument()
    expect(screen.getByText('Track 0/0: No track selected')).toBeInTheDocument()

    unmount()

    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('reuses the same engine instance when the scene blob changes', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstSceneBlob = buildMagePlayerSceneBlob()
    const secondSceneBlob = buildMagePlayerSceneBlob({
      visualizer: {
        skyboxPreset: 2,
      },
    })

    const { rerender } = render(<MagePlayer sceneBlob={firstSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(firstSceneBlob)
    })

    const initialCreateCount = vi.mocked(createMagePlayer).mock.calls.length

    rerender(<MagePlayer sceneBlob={secondSceneBlob} />)

    await waitFor(() => {
      expect(vi.mocked(createMagePlayer).mock.calls.length).toBe(initialCreateCount)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(secondSceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })
  })

  it('validates versioned documents again instead of applying the legacy audio shortcut', async () => {
    const controller = buildMagePlayerController({ loadSceneBlob: vi.fn((value) => { parseSceneDocument(value) }) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const valid = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
    const { rerender } = render(<MagePlayer sceneBlob={valid} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(valid))
    const mixed = { ...valid, audioResponseConfig: { source: 'injected' } }
    rerender(<MagePlayer sceneBlob={mixed} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(valid)
    expect(controller.dispose).toHaveBeenCalled()
    expect(controller.setAudioResponseSettings).not.toHaveBeenCalled()
    rerender(<MagePlayer sceneBlob={{ ...valid }} />)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('does not invoke forbidden template audio getters during render or playback', async () => {
    const controller = buildMagePlayerController({ loadSceneBlob: vi.fn((value) => { parseSceneDocument(value) }) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const getter = vi.fn(() => '/forbidden.mp3')
    const scene = Object.defineProperty({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 },
      'audioPath', { get: getter, enumerable: true })
    render(<MagePlayer sceneBlob={scene} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(getter).not.toHaveBeenCalled()
    expect(controller.loadAudio).not.toHaveBeenCalled()
  })

  it('shows a recoverable error state when the scene is invalid', async () => {
    const controller = buildMagePlayerController({
      loadSceneBlob: vi.fn((sceneBlob: unknown) => {
        if (typeof sceneBlob === 'object' && sceneBlob !== null && 'invalid' in sceneBlob) {
          throw new Error('Scene data is missing required MAGE fields.')
        }
      }),
    })

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const { rerender } = render(
      <MagePlayer
        sceneBlob={{
          invalid: true,
        }}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('This scene needs changes.')
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(controller.dispose).not.toHaveBeenCalled()

    const validSceneBlob = buildMagePlayerSceneBlob()

    rerender(<MagePlayer sceneBlob={validSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(validSceneBlob)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('supports a paused initial playback state and toggles playback from the shared control bar', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer initialPlayback="paused" sceneBlob={sceneBlob} />)

    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    })

    const playbackButton = screen.getByRole('button', { name: /play scene and audio playback/i })
    expect(playbackButton).toHaveAttribute('aria-pressed', 'false')
    expect(playbackButton).toHaveAccessibleName('Play scene and audio playback')

    fireEvent.click(playbackButton)

    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(playbackButton).toHaveAttribute('aria-pressed', 'true')
    expect(playbackButton).toHaveAccessibleName('Pause scene and audio playback')
    await waitFor(() => {
      expect(playbackButton).not.toHaveFocus()
    })
  })

  it('captures the live aspect ratio after resizing, with a host-size fallback', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const onCaptureFramePreviewChange = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    render(
      <MagePlayer
        onCaptureFramePreviewChange={onCaptureFramePreviewChange}
        sceneBlob={sceneBlob}
      />,
    )

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(onCaptureFramePreviewChange).toHaveBeenCalledWith(
        expect.any(Function),
      )
    })

    const captureFramePreview =
      onCaptureFramePreviewChange.mock.calls.at(-1)?.[0]

    const canvas = screen.getByLabelText('MAGE scene preview') as HTMLDivElement
    const readBounds = vi.spyOn(canvas, 'getBoundingClientRect')
    readBounds.mockReturnValue({ width: 1280, height: 720 } as DOMRect)
    const previewDataUrl = await captureFramePreview?.()

    expect(controller.captureFramePreview).toHaveBeenCalledWith({
      height: 288,
      type: 'image/png',
      width: 512,
    })
    expect(previewDataUrl).toMatch(/^data:image\/png;base64,/)

    readBounds.mockReturnValue({ width: 450, height: 800 } as DOMRect)
    await captureFramePreview?.()
    expect(controller.captureFramePreview).toHaveBeenLastCalledWith({
      height: 512,
      type: 'image/png',
      width: 288,
    })

    readBounds.mockReturnValue({ width: 0, height: 0 } as DOMRect)
    Object.defineProperties(canvas, { clientWidth: { value: 512 }, clientHeight: { value: 512 } })
    await captureFramePreview?.()
    expect(controller.captureFramePreview).toHaveBeenLastCalledWith({
      height: 480,
      type: 'image/png',
      width: 480,
    })
  })

  it('rejects an oversized saved scene before allocating a renderer and recovers after a valid replacement', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const invalid = buildMagePlayerSceneBlob({ visualizer: { shader: 'x'.repeat(65537) } })
    const { rerender } = render(<MagePlayer sceneBlob={invalid} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/shader/)
    expect(createMagePlayer).not.toHaveBeenCalled()
    const valid = buildMagePlayerSceneBlob()
    rerender(<MagePlayer sceneBlob={valid} renderProfile="preview" />)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledWith(expect.any(HTMLDivElement),
      expect.objectContaining({ renderProfile: 'preview', initialSceneBlob: valid })))
    expect(controller.loadSceneBlob).toHaveBeenCalledWith(valid)
  })

  it('opens a connected playlist even before audio has been selected', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onRequestPlaylistOpen = vi.fn()
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} onRequestPlaylistOpen={onRequestPlaylistOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open playlist' }))
    expect(onRequestPlaylistOpen).toHaveBeenCalledTimes(1)
  })

  it('suppresses playback controls while the player is empty', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    render(<MagePlayer sceneBlob={null} />)

    expect(await screen.findByText('No scene selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
