import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer, type MagePlayerProps } from './MagePlayer'
import { createMagePlayer, type MagePlayerAudioState } from './infrastructure/engineAdapter'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { readAudioFileDuration } from './magePlayerUtils'
import { buildMagePlayerController } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))
vi.mock('./magePlayerUtils', async original => ({
  ...await original<typeof import('./magePlayerUtils')>(),
  readAudioFileDuration: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const availabilityResponse = (ids = [24], allowed = true) => new Response(JSON.stringify(
  ids.map(sceneId => ({ sceneId, available: allowed, code: allowed ? 'AVAILABLE' : 'SCENE_DISABLED' })),
), { status: 200 })
const audioFile = (name: string) => new File(['music'], name, { type: 'audio/mpeg' })
const inputIn = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement
const select = (container: HTMLElement, ...names: string[]) => fireEvent.change(inputIn(container), {
  target: { files: names.map(audioFile) },
})

function fixture(overrides: Partial<MagePlayerProps> = {}) {
  const controller = buildMagePlayerController({ updateSceneSettings: vi.fn() })
  vi.mocked(createMagePlayer).mockResolvedValue(controller)
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => {
    const ids = new URL(String(input), 'https://mage.example').searchParams.get('ids')?.split(',').map(Number) ?? [24]
    return availabilityResponse(ids)
  })
  vi.stubGlobal('fetch', fetchMock)
  const onPlaylistChange = vi.fn()
  const onSelectedTrackChange = vi.fn()
  const onClearMusic = vi.fn()
  const props: MagePlayerProps = {
    audioMode: 'single', sceneKey: 24, sceneBlob: template,
    onPlaylistChange, onSelectedTrackChange, onClearMusic, ...overrides,
  }
  const view = render(<MagePlayer {...props} />)
  return { ...view, controller, fetchMock, onPlaylistChange, onSelectedTrackChange, onClearMusic, props }
}

async function ready(f: ReturnType<typeof fixture>) {
  await waitFor(() => expect(f.container.querySelector('.mage-player')).toHaveAttribute('data-state', 'ready'))
}

async function loadMusic(f: ReturnType<typeof fixture>, ...names: string[]) {
  await ready(f)
  select(f.container, ...(names.length ? names : ['original.mp3']))
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled())
  f.onPlaylistChange.mockClear()
  f.onSelectedTrackChange.mockClear()
}

function clearMusic() {
  fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
  const clear = screen.getByRole('button', { name: 'Clear music' })
  expect(clear).toBeEnabled()
  fireEvent.click(clear)
}

function expectEmpty(f: ReturnType<typeof fixture>) {
  expect(f.controller.getAudioState()).toMatchObject({ currentTime: 0, duration: 0, isLoaded: false, hasSource: false, sourcePath: null })
  expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeDisabled()
  expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toHaveValue('0')
  expect(screen.queryByText(/original\.mp3/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Loading (song|track)/)).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createMagePlayer).mockReset()
  vi.mocked(readAudioFileDuration).mockResolvedValue(185)
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

describe('Clear music across player sessions', () => {
  it.each(['playing', 'paused'] as const)('clears music and releases its URL without changing a %s scene or its volume', async playback => {
    const f = fixture({ initialPlayback: playback })
    await loadMusic(f)
    fireEvent.change(screen.getByRole('slider', { name: 'Seek scene audio' }), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adjust audio volume' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Audio volume' }), { target: { value: '0.4' } })
    const source = vi.mocked(f.controller.loadAudio).mock.calls[0][0]!.sourcePath!
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    vi.mocked(f.controller.setPlaybackState).mockClear()
    clearMusic()
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenLastCalledWith([]))
    expect(f.onSelectedTrackChange).toHaveBeenLastCalledWith(null)
    expect(f.onClearMusic).toHaveBeenCalledOnce()
    expectEmpty(f)
    expect(f.controller.getAudioState().volume).toBe(0.4)
    expect(f.controller.getPlaybackState()).toBe(playback)
    expect(f.controller.setPlaybackState).not.toHaveBeenCalled()
    expect(f.controller.resetPlayback).not.toHaveBeenCalled()
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(f.controller.dispose).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(revoke.mock.calls.filter(([path]) => path === source)).toHaveLength(1)
    expect(screen.queryByRole('slider', { name: 'Audio volume' })).not.toBeInTheDocument()
  })

  it('empties every playlist entry and remains harmless when cleared again with no music', async () => {
    const f = fixture({ audioMode: 'playlist', repeatEnabled: true, shuffleEnabled: true })
    await loadMusic(f, 'original.mp3', 'second.mp3', 'third.mp3')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    clearMusic()
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenLastCalledWith([]))
    expect(f.onSelectedTrackChange).toHaveBeenLastCalledWith(null)
    expect(revoke).toHaveBeenCalledTimes(3)
    expectEmpty(f)
    expect(screen.getByText('Track 0/0: No track selected')).toBeInTheDocument()
    clearMusic()
    expect(revoke).toHaveBeenCalledTimes(3)
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(f.controller.getPlaybackState()).toBe('playing')
  })

  it.each([
    { mode: 'single', result: 'resolve' }, { mode: 'single', result: 'reject' },
    { mode: 'playlist', result: 'resolve' }, { mode: 'playlist', result: 'reject' },
  ] as const)('ignores a pending $mode load that completes with $result after clearing', async ({ mode, result }) => {
    const f = fixture({ audioMode: mode })
    await ready(f)
    const pending = deferred<MagePlayerAudioState>()
    vi.mocked(f.controller.loadAudio).mockReturnValueOnce(pending.promise)
    select(f.container, 'pending.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledOnce())
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const options = vi.mocked(f.controller.loadAudio).mock.calls[0][0]!
    clearMusic()
    await waitFor(() => expect(f.onPlaylistChange).toHaveBeenLastCalledWith([]))
    if (mode === 'single') expect(options.signal?.aborted).toBe(true)
    expect(revoke).toHaveBeenCalledWith(options.sourcePath)
    await act(async () => {
      if (result === 'reject') pending.reject(new Error('A stale decode failed.'))
      else pending.resolve({ currentTime: 0, duration: 185, hasSource: true, isLoaded: true, sourcePath: 'pending.mp3', volume: 1 })
    })
    expectEmpty(f)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(f.onPlaylistChange).toHaveBeenLastCalledWith([])
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(f.controller.getPlaybackState()).toBe('playing')
  })

  it('cancels unfinished playlist metadata so its result cannot append songs after clearing', async () => {
    const f = fixture({ audioMode: 'playlist' })
    await loadMusic(f)
    const metadata = deferred<number>()
    vi.mocked(readAudioFileDuration).mockReturnValueOnce(metadata.promise)
    select(f.container, 'slow-metadata.mp3')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    clearMusic()
    await act(async () => metadata.resolve(120))
    expect(f.onPlaylistChange).toHaveBeenLastCalledWith([])
    expect(f.onPlaylistChange).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expectEmpty(f)
  })

  it('rejects a result from a chooser opened before clearing and allows picking the same file again', async () => {
    const f = fixture()
    await loadMusic(f)
    fireEvent.click(screen.getByRole('button', { name: 'Replace song' }))
    clearMusic()
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    select(f.container, 'obsolete-dialog.mp3')
    await act(async () => {})
    expect(createUrl).not.toHaveBeenCalled()
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(inputIn(f.container).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Add song' }))
    select(f.container, 'original.mp3')
    await waitFor(() => expect(f.controller.loadAudio).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled())
    expect(screen.getByText('original.mp3')).toBeInTheDocument()
  })

  it('clears while permission is being checked and does not reload music when the check allows playback', async () => {
    const f = fixture()
    await loadMusic(f)
    const permission = deferred<Response>()
    f.fetchMock.mockReturnValue(permission.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(f.container.querySelector('.mage-player')).toHaveAttribute('data-availability-pending', 'true')
    clearMusic()
    expect(f.controller.getAudioState().isLoaded).toBe(false)
    await act(async () => permission.resolve(availabilityResponse()))
    await ready(f)
    expectEmpty(f)
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it.each(['stopped', 'denied'] as const)('clears retained music while %s without resuming or bypassing its block', async condition => {
    const f = fixture()
    await loadMusic(f)
    const key = sceneRecoveryKey(template, 24)!
    if (condition === 'stopped') act(() => sceneRecovery.block(key, 'stopped'))
    else {
      f.fetchMock.mockImplementation(async () => availabilityResponse([24], false))
      act(() => window.dispatchEvent(new Event('focus')))
    }
    await waitFor(() => expect(f.container.querySelector('.mage-player')).toHaveAttribute('data-state', condition === 'stopped' ? 'blocked' : 'unavailable'))
    const block = sceneRecovery.getBlock(key)
    const source = vi.mocked(f.controller.loadAudio).mock.calls[0][0]!.sourcePath!
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    vi.mocked(f.controller.setPlaybackState).mockClear()
    clearMusic()
    expect(f.onPlaylistChange).toHaveBeenLastCalledWith([])
    expect(f.onSelectedTrackChange).toHaveBeenLastCalledWith(null)
    expect(revoke).toHaveBeenCalledWith(source)
    expect(f.container.querySelector('.mage-player')).toHaveAttribute('data-state', condition === 'stopped' ? 'blocked' : 'unavailable')
    expect(sceneRecovery.getBlock(key)).toEqual(block)
    expect(f.controller.setPlaybackState).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    if (condition === 'stopped') {
      fireEvent.click(screen.getByRole('button', { name: 'Resume scene' }))
      await ready(f)
      expect(f.controller.loadAudio).toHaveBeenCalledOnce()
      expect(screen.getByText('No song selected')).toBeInTheDocument()
    } else expect(sceneAvailabilityStore.isAllowed('template:24')).toBe(false)
  })

  it('keeps the queue empty when clearing at a repeat/end-of-track boundary', async () => {
    const f = fixture({ audioMode: 'playlist', repeatEnabled: true })
    await loadMusic(f, 'original.mp3', 'next.mp3')
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    const clear = screen.getByRole('button', { name: 'Clear music' })
    act(() => {
      fireEvent.change(screen.getByRole('slider', { name: 'Seek scene audio' }), { target: { value: '184.9' } })
      fireEvent.click(clear)
    })
    await act(async () => {})
    expectEmpty(f)
    expect(f.onSelectedTrackChange).toHaveBeenLastCalledWith(null)
    expect(f.onPlaylistChange).toHaveBeenLastCalledWith([])
    expect(f.controller.getPlaybackState()).toBe('playing')
  })

  it('keeps cleared music empty across a live edit and does not alter the scene document', async () => {
    const f = fixture()
    await loadMusic(f)
    const original = structuredClone(template)
    clearMusic()
    const next = { ...template, settings: { camera: { fov: 96 } } }
    f.rerender(<MagePlayer {...f.props} sceneBlob={next} />)
    await waitFor(() => expect(f.controller.updateSceneSettings).toHaveBeenCalledWith(next, { sceneKey: 24 }))
    expect(template).toEqual(original)
    expect(next).toEqual({ ...original, settings: { camera: { fov: 96 } } })
    expectEmpty(f)
    expect(f.controller.loadAudio).toHaveBeenCalledOnce()
    expect(f.controller.loadSceneBlob).toHaveBeenCalledOnce()
  })
})
