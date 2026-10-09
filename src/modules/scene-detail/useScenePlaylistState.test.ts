import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerPlaylistTrack, MageSceneBlob } from '@modules/player'
import { useScenePlaylistState } from './useScenePlaylistState'

afterEach(() => { vi.restoreAllMocks() })

const source = { schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(1)' } } }
const deviceTrack = (id: string): MagePlayerPlaylistTrack => ({
  id, sourceType: 'device', sourcePath: `blob:${id}`, name: id, duration: 20,
})

describe('scene playlist identity', () => {
  it.each(['custom', 'template'])('retains viewer tracks for valid %s response edits and clears them when changing scene identity', async kind => {
    const scene: MageSceneBlob = kind === 'template'
      ? { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
      : source
    const { result, rerender } = renderHook(({ blob, key }) => useScenePlaylistState(blob, key), {
      initialProps: { blob: scene, key: 1 },
    })
    await act(async () => {})
    const track: MagePlayerPlaylistTrack = { id: 'local', sourceType: 'device', sourcePath: 'blob:local', name: 'Local', duration: 20 }
    act(() => {
      result.current.handlePlaylistChange([track])
      result.current.setSelectedTrackId(track.id)
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    revoke.mockClear()
    const response = { audioResponse: 'mapped-v1', audioResponseConfig: { version: 1, sensitivity: 2 } }
    rerender({ blob: kind === 'template' ? { ...scene, settings: response } : { ...source, scene: { ...source.scene, ...response } }, key: 1 })
    await act(async () => {})
    expect(result.current.playlistTracks).toEqual([track])
    expect(result.current.selectedTrackId).toBe('local')
    expect(revoke).not.toHaveBeenCalled()
    rerender({ blob: scene, key: 2 })
    await waitFor(() => expect(result.current.playlistTracks).toEqual([]))
    expect(result.current.selectedTrackId).toBeNull()
    expect(revoke).toHaveBeenCalledWith('blob:local')
    revoke.mockRestore()
  })
})

describe('clearing route-owned music', () => {
  it('clears shuffled music, base order, selection and repeat, closes the playlist and releases each URL only once', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { result, unmount } = renderHook(() => useScenePlaylistState(source, 1), { wrapper: StrictMode })
    await act(async () => {})
    const tracks = [deviceTrack('first'), deviceTrack('second'), deviceTrack('third')]
    act(() => {
      result.current.handlePlaylistChange(tracks)
      result.current.setSelectedTrackId('second')
      result.current.setIsPlaylistOpen(true)
      result.current.toggleRepeat()
      result.current.toggleShuffle()
    })
    const stale = result.current
    expect(stale.isShuffleEnabled).toBe(true)
    expect(stale.isRepeatEnabled).toBe(true)
    act(() => {
      // The player's clear notifications intentionally converge on one cleanup.
      stale.handlePlaylistChange([])
      stale.setSelectedTrackId(null)
      stale.handleClearMusic()
      expect(revoke).toHaveBeenCalledTimes(3)
    })
    expect(result.current).toMatchObject({ playlistTracks: [], selectedTrackId: null,
      isShuffleEnabled: false, isRepeatEnabled: false, isPlaylistOpen: false })
    act(() => {
      stale.toggleShuffle(); stale.toggleRepeat()
      stale.handleReorderTracks(tracks)
      stale.handleTrackDurationChange('second', 200)
      stale.handleUpdateTrack('second', { title: 'Late metadata' })
      stale.setSelectedTrackId('second')
    })
    expect(result.current).toMatchObject({ playlistTracks: [], selectedTrackId: null, isShuffleEnabled: false, isRepeatEnabled: false })
    unmount()
    expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual(['blob:first', 'blob:second', 'blob:third'])
  })

  it('does not let pending scene initialization restore music after clear and does not modify the saved scene', async () => {
    const queued: Array<() => void> = []
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => { queued.push(callback) })
    const scene = { ...source, scene: { ...source.scene, audioPath: 'https://music.example.test/saved.mp3' } }
    const original = structuredClone(scene)
    const { result, rerender } = renderHook(({ blob }) => useScenePlaylistState(blob, 1), { initialProps: { blob: scene } })
    expect(queued).toHaveLength(1)
    act(() => {
      result.current.handleClearMusic()
      queued.splice(0).forEach(callback => callback())
    })
    expect(result.current.playlistTracks).toEqual([])
    rerender({ blob: structuredClone(scene) })
    act(() => { queued.splice(0).forEach(callback => callback()) })
    expect(result.current.playlistTracks).toEqual([])
    expect(scene).toEqual(original)
  })

  it('keeps a cleared saved song off on same-scene refresh but initializes it on a new visit', async () => {
    const scene = { ...source, scene: { ...source.scene, audioPath: 'https://music.example.test/saved.mp3' } }
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { result, rerender, unmount } = renderHook(({ blob, key }) => useScenePlaylistState(blob, key), {
      initialProps: { blob: scene, key: 1 },
    })
    await waitFor(() => expect(result.current.playlistTracks).toHaveLength(1))
    act(() => { result.current.handleClearMusic() })
    rerender({ blob: structuredClone(scene), key: 1 })
    await act(async () => {})
    expect(result.current.playlistTracks).toEqual([])
    expect(scene.scene.audioPath).toBe('https://music.example.test/saved.mp3')
    expect(revoke).not.toHaveBeenCalled()
    rerender({ blob: scene, key: 2 })
    await waitFor(() => expect(result.current.playlistTracks).toHaveLength(1))
    expect(result.current.selectedTrackId).toBe(`scene:${scene.scene.audioPath}`)
    unmount()
    expect(revoke).not.toHaveBeenCalled()
    const freshVisit = renderHook(() => useScenePlaylistState(scene, 1))
    await waitFor(() => expect(freshVisit.result.current.playlistTracks).toHaveLength(1))
    freshVisit.unmount()
  })

  it('accepts fresh music after clear without restoring old URLs or losing it to a stale reorder', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { result, unmount } = renderHook(() => useScenePlaylistState(source, 1))
    await act(async () => {})
    const oldTracks = [deviceTrack('old-a'), deviceTrack('old-b')]
    act(() => { result.current.handlePlaylistChange(oldTracks); result.current.toggleShuffle() })
    const stale = result.current
    act(() => { result.current.handleClearMusic() })
    const nextTrack = deviceTrack('fresh')
    act(() => {
      result.current.handlePlaylistChange([nextTrack])
      result.current.setSelectedTrackId(nextTrack.id)
      stale.handleReorderTracks(oldTracks)
      stale.toggleShuffle()
      stale.toggleShuffle()
    })
    expect(result.current.playlistTracks).toEqual([nextTrack])
    expect(result.current.selectedTrackId).toBe('fresh')
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:old-a', 'blob:old-b'])
    unmount()
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:old-a', 'blob:old-b', 'blob:fresh'])
  })

  it('removes tracks from the base order so shuffle cannot restore them and clearing releases duplicate URLs once', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { result, unmount } = renderHook(() => useScenePlaylistState(source, 1))
    await act(async () => {})
    const first = deviceTrack('first'), second = deviceTrack('second')
    act(() => { result.current.handlePlaylistChange([first, second]); result.current.toggleShuffle() })
    act(() => { result.current.handlePlaylistChange([second]); result.current.toggleShuffle() })
    expect(result.current.playlistTracks).toEqual([second])
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:first')
    act(() => {
      result.current.handlePlaylistChange([second, { ...second, id: 'duplicate' }])
      result.current.handleClearMusic()
    })
    unmount()
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:first', 'blob:second'])
  })
})
