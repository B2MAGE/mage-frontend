import { describe, expect, it } from 'vitest'
import { normalizeSceneDetail } from './dto'

const scene = {
  sceneId: 23, ownerUserId: 8, creatorDisplayName: 'Scene Artist', creatorHandle: 'artist',
  name: 'Signal Bloom', description: 'Soft movement.', sceneData: null,
  createdAt: '2026-10-03T00:00:00Z', thumbnailRef: '/signal.png', tags: ['ambient'],
  engagement: { views: 42, upvotes: 2, downvotes: 0, saves: 1, currentUserVote: null, currentUserSaved: false },
}
const availability = { sceneId: 23, available: false, code: 'CUSTOM_RENDERING_DISABLED', message: 'Scene playback is temporarily disabled.' }

describe('scene detail availability normalization', () => {
  it('preserves the full detail view when source is intentionally withheld', () => {
    expect(normalizeSceneDetail({ ...scene, availability })).toEqual({
      id: 23, ownerUserId: 8, creatorDisplayName: 'Scene Artist', creatorHandle: 'artist',
      name: 'Signal Bloom', description: 'Soft movement.', sceneData: null,
      createdAt: scene.createdAt, thumbnailRef: '/signal.png', tags: ['ambient'],
      engagement: scene.engagement, availability, sceneMode: null,
    })
  })

  it.each([
    undefined,
    { ...availability, available: true, code: 'AVAILABLE' },
    { ...availability, sceneId: 24 },
    { ...availability, available: 'false' },
  ])('rejects missing source without an explicit matching unavailable status: %j', status => {
    expect(normalizeSceneDetail({ ...scene, availability: status })).toBeNull()
  })

  it('never forwards source alongside a disabled status', () => {
    expect(normalizeSceneDetail({ ...scene, sceneData: { visualizer: { shader: 'stale' } }, availability })?.sceneData).toBeNull()
  })

  it('accepts a refreshed source once availability is restored', () => {
    const restored = { ...availability, available: true, code: 'AVAILABLE', message: 'Scene is available.' }
    const sceneData = { visualizer: { shader: 'repaired' } }
    expect(normalizeSceneDetail({ ...scene, sceneData, availability: restored })).toMatchObject({ sceneData, availability: { ...restored, message: '' } })
  })
})
