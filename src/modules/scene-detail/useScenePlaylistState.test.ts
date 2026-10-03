import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MagePlayerPlaylistTrack, MageSceneBlob } from '@modules/player'
import { useScenePlaylistState } from './useScenePlaylistState'

describe('scene playlist identity', () => {
  it.each(['custom', 'template'])('retains viewer tracks for valid %s response edits and clears them when changing scene identity', async kind => {
    const scene: MageSceneBlob = kind === 'template'
      ? { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
      : { visualizer: { shader: 'sphere(1)' } }
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
    rerender({ blob: kind === 'template' ? { ...scene, settings: response } : { ...scene, ...response }, key: 1 })
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
