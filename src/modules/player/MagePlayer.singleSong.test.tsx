import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerAudioState } from './infrastructure/engineAdapter'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { sceneRecovery } from './recovery/sceneRecovery'
import { buildMagePlayerController } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const available = (ids = [24]) => new Response(JSON.stringify(
  ids.map(sceneId => ({ sceneId, available: true, code: 'AVAILABLE' })),
), { status: 200 })
const audioFile = (name: string) => new File(['music'], name, { type: 'audio/mpeg' })
const inputIn = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement
const select = (container: HTMLElement, ...names: string[]) => fireEvent.change(inputIn(container), {
  target: { files: names.map(audioFile) },
})

function fixture() {
  const controller = buildMagePlayerController({ updateSceneSettings: vi.fn() })
  vi.mocked(createMagePlayer).mockResolvedValue(controller)
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => {
    const ids = new URL(String(input), 'https://mage.example').searchParams.get('ids')?.split(',').map(Number) ?? [24]
    return available(ids)
  })
  vi.stubGlobal('fetch', fetchMock)
  const onPlaylistChange = vi.fn()
  const view = render(<MagePlayer audioMode="single" sceneKey={24} sceneBlob={template} onPlaylistChange={onPlaylistChange} />)
  return { ...view, controller, fetchMock, onPlaylistChange }
}

async function ready(controller: ReturnType<typeof buildMagePlayerController>) {
  await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole('button', { name: /pause scene and audio playback/i })).toBeEnabled())
}

async function loadFirst(f: ReturnType<typeof fixture>) {
  await ready(f.controller)
  select(f.container, 'original.mp3')
  await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledWith([
    expect.objectContaining({ name: 'original.mp3' }),
  ]))
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled())
  f.onPlaylistChange.mockClear()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createMagePlayer).mockReset()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  sceneAvailabilityStore.invalidate()
  sceneRecovery.setSafeMode(false)
})
afterEach(() => {
  cleanup()
  sceneAvailabilityStore.invalidate()
  sceneRecovery.setSafeMode(false)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('single-song player replacement', () => {
  it('keeps the current song until the replacement is usable, then commits one track without reloading the scene or audio', async () => {
    const f = fixture()
    await loadFirst(f)
    expect(inputIn(f.container).multiple).toBe(false)
    const oldTrack = vi.mocked(f.controller.loadAudio).mock.calls[0][0]!
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const decode = deferred<void>()
    const loadAudio = vi.mocked(f.controller.loadAudio).getMockImplementation()!
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(async options => { await decode.promise; return loadAudio(options) })
    select(f.container, 'replacement.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/original\.mp3/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading song…')
    expect(revoke).not.toHaveBeenCalledWith(oldTrack.sourcePath)

    await act(async () => decode.resolve())
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'replacement.mp3', duration: 185 }),
    ]))
    expect(f.onPlaylistChange).toHaveBeenCalledOnce()
    expect(f.controller.loadAudio).toHaveBeenCalledTimes(2)
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith(oldTrack.sourcePath)
  })

  it('retains the previous song and usable controls when replacement decoding fails', async () => {
    const f = fixture()
    await loadFirst(f)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const originalPath = vi.mocked(f.controller.loadAudio).mock.calls[0][0]!.sourcePath
    vi.mocked(f.controller.loadAudio).mockRejectedValueOnce(new Error('This audio file could not be decoded.'))
    select(f.container, 'broken.mp3')
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be decoded')
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(screen.getByText(/original\.mp3/)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled()
    const rejectedPath = vi.mocked(f.controller.loadAudio).mock.calls[1][0]!.sourcePath
    expect(revoke).toHaveBeenCalledWith(rejectedPath)
    expect(revoke).not.toHaveBeenCalledWith(originalPath)
    expect(f.controller.getAudioState().sourcePath).toBe('original.mp3')
  })

  it('does not read or queue unexpected multiple files and leaves a canceled chooser unchanged', async () => {
    const f = fixture()
    await loadFirst(f)
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    select(f.container, 'extra-one.mp3', 'extra-two.mp3')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(createUrl).not.toHaveBeenCalled()
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    fireEvent.change(inputIn(f.container), { target: { files: [] } })
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(screen.getByText(/original\.mp3/)).toBeInTheDocument()
  })

  it('disables playback during replacement and preserves playing state and volume when the new song arrives', async () => {
    const f = fixture()
    await loadFirst(f)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust audio volume' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Audio volume' }), { target: { value: '0.4' } })
    const decode = deferred<void>()
    const loadAudio = vi.mocked(f.controller.loadAudio).getMockImplementation()!
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(async options => { await decode.promise; return loadAudio(options) })
    select(f.container, 'paused-replacement.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    const pause = screen.getByRole('button', { name: /pause scene and audio playback/i })
    expect(pause).toBeDisabled()
    fireEvent.click(pause)
    expect(f.controller.getPlaybackState()).toBe('playing')
    await act(async () => decode.resolve())
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledOnce())
    expect(f.controller.getPlaybackState()).toBe('playing')
    expect(f.controller.getAudioState()).toMatchObject({ sourcePath: 'paused-replacement.mp3', volume: 0.4 })
    expect(screen.getByRole('button', { name: /pause scene and audio playback/i })).toBeEnabled()
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
  })

  it('cancels a superseded pending selection so late completion cannot replace the newest song', async () => {
    const f = fixture()
    await loadFirst(f)
    const stale = deferred<MagePlayerAudioState>()
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(() => stale.promise)
    select(f.container, 'stale.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    const oldOptions = vi.mocked(f.controller.loadAudio).mock.calls[1][0]!
    select(f.container, 'newest.mp3')
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'newest.mp3' }),
    ]))
    expect(oldOptions.signal?.aborted).toBe(true)
    await act(async () => stale.resolve({ ...f.controller.getAudioState(), sourcePath: 'stale.mp3' }))
    expect(f.onPlaylistChange).toHaveBeenCalledOnce()
    expect(screen.getByText(/newest\.mp3/)).toBeInTheDocument()
    expect(screen.queryByText(/stale\.mp3/)).not.toBeInTheDocument()
    expect(f.controller.loadAudio).toHaveBeenCalledTimes(3)
  })

  it('does not repeat or reload a finished song even if playlist repeat is supplied to single mode', async () => {
    const f = fixture()
    await loadFirst(f)
    const onSelectedTrackChange = vi.fn()
    f.rerender(<MagePlayer audioMode="single" sceneKey={24} sceneBlob={template} repeatEnabled
      onPlaylistChange={f.onPlaylistChange} onSelectedTrackChange={onSelectedTrackChange} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Seek scene audio' }), { target: { value: '184.9' } })
    await act(async () => {})
    expect(f.controller.getAudioState().currentTime).toBe(184.9)
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(onSelectedTrackChange).not.toHaveBeenCalled()
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(screen.getByText(/original\.mp3/)).toBeInTheDocument()
  })

  it('applies a live camera edit while replacing a song without canceling either current audio or the pending decode', async () => {
    const f = fixture()
    await loadFirst(f)
    const decode = deferred<void>()
    const loadAudio = vi.mocked(f.controller.loadAudio).getMockImplementation()!
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(async options => { await decode.promise; return loadAudio(options) })
    select(f.container, 'editing-replacement.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    const options = vi.mocked(f.controller.loadAudio).mock.calls[1][0]!
    const clearAudio = vi.mocked(f.controller.clearAudio)
    clearAudio.mockClear()
    const next = { ...template, settings: { camera: { fov: 96 } } }
    f.rerender(<MagePlayer audioMode="single" sceneKey={24} sceneBlob={next} onPlaylistChange={f.onPlaylistChange} />)
    await waitFor(() => expect(f.controller.updateSceneSettings).toHaveBeenCalledWith(next, { sceneKey: 24 }))
    expect(options.signal?.aborted).toBe(false)
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(f.controller.getAudioState().sourcePath).toBe('original.mp3')
    expect(screen.getByRole('status')).toHaveTextContent('Loading song…')
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(clearAudio).not.toHaveBeenCalled()
    await act(async () => decode.resolve())
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'editing-replacement.mp3' }),
    ]))
    expect(f.controller.loadAudio).toHaveBeenCalledTimes(2)
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it.each(['focus-first', 'change-first'])('keeps a replacement through a native picker availability recheck (%s)', async order => {
    const f = fixture()
    await loadFirst(f)
    const decode = deferred<void>()
    const permission = deferred<Response>()
    const loadAudio = vi.mocked(f.controller.loadAudio).getMockImplementation()!
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(async options => { await decode.promise; return loadAudio(options) })
    const canvas = f.container.querySelector('.mage-player__render-host')
    if (order === 'change-first') {
      select(f.container, 'focus-replacement.mp3')
      await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    }
    f.fetchMock.mockReturnValue(permission.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    if (order === 'focus-first') select(f.container, 'focus-replacement.mp3')
    await act(async () => decode.resolve())
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(f.controller.dispose).not.toHaveBeenCalled()
    expect(f.container.querySelector('.mage-player__render-host')).toBe(canvas)
    await act(async () => permission.resolve(available()))
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'focus-replacement.mp3' }),
    ]))
    expect(f.controller.loadAudio).toHaveBeenCalledTimes(2)
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it.each(['unmount', 'stop', 'navigate'])('aborts replacement and releases only its pending source when the session ends through %s', async action => {
    const f = fixture()
    await loadFirst(f)
    const pending = deferred<MagePlayerAudioState>()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    vi.mocked(f.controller.loadAudio).mockImplementationOnce(() => pending.promise)
    select(f.container, 'abandoned.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    const options = vi.mocked(f.controller.loadAudio).mock.calls[1][0]!
    if (action === 'unmount') f.unmount()
    else if (action === 'stop') act(() => sceneRecovery.setSafeMode(true))
    else f.rerender(<MagePlayer audioMode="single" sceneKey={25} sceneBlob={template} onPlaylistChange={f.onPlaylistChange} />)
    await waitFor(() => expect(options.signal?.aborted).toBe(true))
    expect(revoke).toHaveBeenCalledWith(options.sourcePath)
    await act(async () => pending.resolve({ ...f.controller.getAudioState(), sourcePath: 'abandoned.mp3' }))
    expect(f.onPlaylistChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/abandoned\.mp3/)).not.toBeInTheDocument()
  })
})
