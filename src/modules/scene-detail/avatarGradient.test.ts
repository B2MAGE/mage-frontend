import { describe, expect, it } from 'vitest'
import { normalizeSceneComment, normalizeSceneDetail } from './dto'
import { buildCreatorProfile } from './viewModels'

describe('scene avatar gradient ownership', () => {
  it('preserves creator colors and never substitutes the viewer for another creator', () => {
    const scene = normalizeSceneDetail({
      sceneId: 1, ownerUserId: 7, sceneData: {},
      creatorAvatarGradientStart: '#FA3412', creatorAvatarGradientEnd: '#CF5312',
    })!
    expect(buildCreatorProfile(scene, 'Viewer', 'viewer', 9, '#111111', '#222222')).toMatchObject({
      avatarGradientStart: '#fa3412', avatarGradientEnd: '#cf5312',
    })

    const legacyScene = normalizeSceneDetail({ sceneId: 2, ownerUserId: 7, sceneData: {} })!
    expect(buildCreatorProfile(legacyScene, 'Viewer', 'viewer', 9, '#111111', '#222222')).toMatchObject({
      avatarGradientStart: undefined, avatarGradientEnd: undefined,
    })
    expect(buildCreatorProfile(legacyScene, 'Owner', 'owner', 7, '#111111', '#222222')).toMatchObject({
      avatarGradientStart: '#111111', avatarGradientEnd: '#222222',
    })
    const unknownOwnerScene = normalizeSceneDetail({ sceneId: 3, sceneData: {} })!
    expect(buildCreatorProfile(unknownOwnerScene, 'Viewer', 'viewer', null, '#111111', '#222222')).toMatchObject({
      avatarGradientStart: undefined, avatarGradientEnd: undefined,
    })
  })

  it('keeps comments and nested replies tied to each author', () => {
    const comment = normalizeSceneComment({
      commentId: 1, sceneId: 1, text: 'A comment', authorUserId: 7,
      authorAvatarGradientStart: '#EE1234', authorAvatarGradientEnd: '#AB5678',
      replies: [{
        commentId: 2, sceneId: 1, text: 'A reply', authorUserId: 9,
        authorAvatarGradientStart: '#1357AB', authorAvatarGradientEnd: '#2468CD',
      }],
    })!
    expect(comment).toMatchObject({ authorAvatarGradientStart: '#ee1234', authorAvatarGradientEnd: '#ab5678' })
    expect(comment.replies[0]).toMatchObject({ authorAvatarGradientStart: '#1357ab', authorAvatarGradientEnd: '#2468cd' })
  })
})
