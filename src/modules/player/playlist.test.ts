import { describe, expect, it, vi } from 'vitest'
import {
  mergePlaylistTrackCollections,
  buildScenePlaylistTrack,
  shufflePlaylistTracks,
  type MagePlayerPlaylistTrack,
} from './playlist'

describe('versioned scene playlist tracks', () => {
  const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

  it('does not discover audio from valid or mixed template documents', () => {
    expect(buildScenePlaylistTrack(template)).toBeNull()
    expect(buildScenePlaylistTrack({ ...template, audioPath: 'https://example.com/forbidden.mp3' })).toBeNull()
    expect(buildScenePlaylistTrack({ ...template, settings: { audio: { url: '/forbidden.mp3' } } })).toBeNull()
  })

  it('rejects audio getters before reading them', () => {
    const getter = vi.fn(() => '/forbidden.mp3')
    const scene = Object.defineProperty({ ...template }, 'audioPath', { get: getter, enumerable: true })
    expect(buildScenePlaylistTrack(scene)).toBeNull()
    expect(getter).not.toHaveBeenCalled()
  })

  it('preserves saved audio in the explicit custom envelope', () => {
    const source = { visualizer: { shader: 'custom' }, audioPath: '/music/saved.mp3' }
    expect(buildScenePlaylistTrack({ schemaVersion: 1, kind: 'custom', scene: source }))
      .toEqual(buildScenePlaylistTrack(source))
    expect(buildScenePlaylistTrack({ schemaVersion: 2, kind: 'custom', scene: source })).toBeNull()
  })
})

function createTrack(id: string): MagePlayerPlaylistTrack {
  return {
    duration: 120,
    id,
    name: `${id}.mp3`,
    sourcePath: `blob:${id}`,
    sourceType: 'device',
  }
}

describe('mergePlaylistTrackCollections', () => {
  it('keeps the existing base order for retained tracks and appends new tracks', () => {
    const baseTracks = [createTrack('track-1'), createTrack('track-2'), createTrack('track-3')]
    const nextTracks = [createTrack('track-2'), createTrack('track-1'), createTrack('track-4')]

    expect(mergePlaylistTrackCollections(baseTracks, nextTracks).map((track) => track.id)).toEqual([
      'track-1',
      'track-2',
      'track-4',
    ])
  })
})

describe('shufflePlaylistTracks', () => {
  it('keeps the anchored track first and shuffles the remaining tracks', () => {
    const tracks = [
      createTrack('track-1'),
      createTrack('track-2'),
      createTrack('track-3'),
      createTrack('track-4'),
    ]
    const randomValues = [0.9, 0.3, 0.5]
    let randomIndex = 0

    const shuffledTracks = shufflePlaylistTracks(tracks, 'track-2', () => {
      const nextValue = randomValues[randomIndex] ?? 0
      randomIndex += 1
      return nextValue
    })

    expect(shuffledTracks.map((track) => track.id)).toEqual([
      'track-2',
      'track-3',
      'track-1',
      'track-4',
    ])
  })

  it('shuffles the whole list when there is no anchored track', () => {
    const tracks = [createTrack('track-1'), createTrack('track-2'), createTrack('track-3')]
    const randomValues = [0.1, 0.7]
    let randomIndex = 0

    const shuffledTracks = shufflePlaylistTracks(tracks, null, () => {
      const nextValue = randomValues[randomIndex] ?? 0
      randomIndex += 1
      return nextValue
    })

    expect(shuffledTracks.map((track) => track.id)).toEqual(['track-3', 'track-2', 'track-1'])
  })
})
