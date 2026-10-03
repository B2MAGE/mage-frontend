import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer } from './infrastructure/engineAdapter'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { sceneRecovery } from './recovery/sceneRecovery'
import { readAudioFileDuration } from './magePlayerUtils'
import { buildMagePlayerController, buildMagePlayerTrack } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))
vi.mock('./magePlayerUtils', async original => ({
  ...await original<typeof import('./magePlayerUtils')>(),
  readAudioFileDuration: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const available = () => new Response(JSON.stringify([{ sceneId: 24, available: true, code: 'AVAILABLE' }]), { status: 200 })
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('saved template audio picker during native dialog focus changes', () => {
  it.each(['focus-first', 'change-first'])('retains the input and selected file through the mandatory availability recheck (%s)', async order => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => available())
    vi.stubGlobal('fetch', fetchMock)
    const metadata = deferred<number>()
    vi.mocked(readAudioFileDuration).mockReturnValue(metadata.promise)
    const original = buildMagePlayerController()
    const replacement = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(original).mockResolvedValueOnce(replacement)
    const onPlaylistChange = vi.fn()
    const view = render(<MagePlayer sceneKey={24} sceneBlob={template} onPlaylistChange={onPlaylistChange} />)
    await waitFor(() => expect(original.loadSceneBlob).toHaveBeenCalled())
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['music'], 'selected-song.mp3', { type: 'audio/mpeg' })
    fireEvent.click(screen.getByRole('button', { name: 'Add audio tracks' }))
    if (order === 'change-first') fireEvent.change(input, { target: { files: [file] } })

    const recheck = deferred<Response>()
    fetchMock.mockReturnValue(recheck.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(original.dispose).toHaveBeenCalledOnce())
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(input.isConnected).toBe(true)
    expect(view.container.querySelector('input[type="file"]')).toBe(input)
    if (order === 'focus-first') fireEvent.change(input, { target: { files: [file] } })
    await act(async () => metadata.resolve(123))
    expect(onPlaylistChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'selected-song.mp3', sourceType: 'device' })])
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(replacement.loadAudio).not.toHaveBeenCalled()

    await act(async () => recheck.resolve(available()))
    await waitFor(() => expect(replacement.loadAudio).toHaveBeenCalledWith({
      sourceLabel: 'selected-song.mp3', sourcePath: expect.stringMatching(/^blob:/),
    }))
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(view.container.querySelector('input[type="file"]')).toBe(input)
    expect(screen.getByRole('button', { name: /track 1\/1: selected-song\.mp3/i })).toBeInTheDocument()
  })

  it('appends to the latest playlist rather than replacing changes made while metadata was loading', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => available()))
    const metadata = deferred<number>()
    vi.mocked(readAudioFileDuration).mockReturnValue(metadata.promise)
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onPlaylistChange = vi.fn()
    const existing = buildMagePlayerTrack({ id: 'existing', name: 'existing.mp3' })
    const addedElsewhere = buildMagePlayerTrack({ id: 'other', name: 'other.mp3' })
    const view = render(<MagePlayer sceneKey={24} sceneBlob={template} playlistTracks={[existing]} selectedTrackId={existing.id} onPlaylistChange={onPlaylistChange} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalled())
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['music'], 'new.mp3', { type: 'audio/mpeg' })] } })
    view.rerender(<MagePlayer sceneKey={24} sceneBlob={template} playlistTracks={[existing, addedElsewhere]} selectedTrackId={existing.id} onPlaylistChange={onPlaylistChange} />)
    await act(async () => metadata.resolve(123))
    expect(onPlaylistChange).toHaveBeenCalledWith([existing, addedElsewhere, expect.objectContaining({ name: 'new.mp3' })])
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
  })

  it('releases an unfinished file selection if the viewing session ends', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => available()))
    const metadata = deferred<number>()
    vi.mocked(readAudioFileDuration).mockReturnValue(metadata.promise)
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onPlaylistChange = vi.fn()
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const view = render(<MagePlayer sceneKey={24} sceneBlob={template} onPlaylistChange={onPlaylistChange} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalled())
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['music'], 'cancelled.mp3', { type: 'audio/mpeg' })] } })
    view.unmount()
    expect(revoke).toHaveBeenCalledWith(expect.stringMatching(/^blob:/))
    await act(async () => metadata.resolve(123))
    expect(onPlaylistChange).not.toHaveBeenCalled()
    expect(controller.loadAudio).not.toHaveBeenCalled()
  })
})
