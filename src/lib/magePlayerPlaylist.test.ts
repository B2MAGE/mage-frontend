import { describe, expect, it } from 'vitest'
import {
  mergePlaylistTrackCollections,
  shufflePlaylistTracks,
  type MagePlayerPlaylistTrack,
} from './magePlayerPlaylist'

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
