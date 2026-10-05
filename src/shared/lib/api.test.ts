import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, fetchTags, normalizeSceneAvailability, normalizeSceneListItem } from './api'

describe('buildApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefixes relative paths with /api when no base url is configured', () => {
    expect(buildApiUrl('/users/me')).toBe('/api/users/me')
    expect(buildApiUrl('auth/login')).toBe('/api/auth/login')
  })

  it('does not duplicate an existing /api prefix', () => {
    expect(buildApiUrl('/api/scenes/12')).toBe('/api/scenes/12')
  })

  it('supports same-origin production routing when the base url is set to /api', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')

    expect(buildApiUrl('/users/me')).toBe('/api/users/me')
  })

  it('joins the configured base url with the normalized api path', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://mage.example.com/')

    expect(buildApiUrl('/scenes/12')).toBe('https://mage.example.com/api/scenes/12')
  })

  it('does not double-prefix /api when the configured base url already includes it', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://mage.example.com/api')

    expect(buildApiUrl('/scenes/12')).toBe('https://mage.example.com/api/scenes/12')
  })
})

describe('scene avatar colors', () => {
  const scene = {
    sceneId: 1, ownerUserId: 8, creatorDisplayName: 'Scene Artist',
    name: 'Test scene', createdAt: '2026-09-30T00:00:00Z',
  }

  it('preserves the scene owner colors instead of applying visitor colors', () => {
    expect(normalizeSceneListItem({
      ...scene,
      creatorAvatarGradientStart: '#AB1234',
      creatorAvatarGradientEnd: '#9876EF',
    })).toMatchObject({
      creatorAvatarGradientStart: '#ab1234',
      creatorAvatarGradientEnd: '#9876ef',
    })
  })

  it('safely defaults malformed colors without rejecting the scene', () => {
    expect(normalizeSceneListItem({
      ...scene, creatorAvatarGradientStart: 'red', creatorAvatarGradientEnd: null,
    })).toMatchObject({ creatorAvatarGradientStart: '#5c51ba', creatorAvatarGradientEnd: '#264a48' })
  })
})

describe('scene availability', () => {
  const availability = { sceneId: 1, available: false, code: 'SCENE_DISABLED', message: 'Scene playback is unavailable.' }
  const scene = {
    sceneId: 1, ownerUserId: 8, creatorDisplayName: 'Scene Artist', name: 'Signal Bloom',
    createdAt: '2026-10-03T00:00:00Z', thumbnailRef: '/signal.png', description: 'Soft movement.',
  }

  it('retains builder identity and a clear unavailable status without synthesizing source', () => {
    expect(normalizeSceneListItem({ ...scene, sceneMode: 'builder-v1', sceneData: null,
      availability: { ...availability, code: 'BUILDER_RENDERING_UNAVAILABLE', message: 'Internal reason' } }))
      .toMatchObject({ sceneMode: 'builder-v1', sceneData: null, availability: {
        available: false, code: 'BUILDER_RENDERING_UNAVAILABLE', message: 'Builder scene playback is not available yet.',
      } })
  })

  it('keeps disabled scene metadata without manufacturing playable source', () => {
    expect(normalizeSceneListItem({ ...scene, sceneData: null, availability })).toMatchObject({
      ...scene, sceneData: null, availability,
    })
  })

  it('discards source when the same response says playback is disabled', () => {
    expect(normalizeSceneListItem({ ...scene, sceneData: { shader: 'stale' }, availability })?.sceneData).toBeNull()
  })

  it('does not fabricate source or an available status from a malformed response', () => {
    expect(normalizeSceneListItem({ ...scene, sceneData: null })).toMatchObject({ sceneData: null, availability: null })
    expect(normalizeSceneAvailability({ ...availability, sceneId: 2 }, 1)).toBeNull()
    expect(normalizeSceneAvailability({ ...availability, available: 'false' }, 1)).toBeNull()
  })

  it('only retains public availability fields', () => {
    expect(normalizeSceneAvailability({ ...availability, reason: 'Private operator note', changedByUserId: 8 }, 1)).toEqual(availability)
  })

  it('accepts the backend’s null message for AVAILABLE without inventing an error', () => {
    expect(normalizeSceneAvailability({ sceneId: 1, available: true, code: 'AVAILABLE', message: null }, 1))
      .toEqual({ sceneId: 1, available: true, code: 'AVAILABLE', message: '' })
    expect(normalizeSceneAvailability({ sceneId: 1, available: true, code: 'AVAILABLE', message: 'Unused message' }, 1)?.message).toBe('')
    expect(normalizeSceneAvailability({ ...availability, message: null }, 1)).toBeNull()
  })

  it('retains server mode metadata without deriving trust from scene source or displaying server notes', () => {
    expect(normalizeSceneListItem({ ...scene, sceneMode: 'legacy-custom', sceneData: null,
      availability: { ...availability, code: 'SCENE_UPGRADE_REQUIRED', message: 'Internal migration detail' } }))
      .toMatchObject({ sceneMode: 'legacy-custom', sceneData: null, availability: {
        available: false, code: 'SCENE_UPGRADE_REQUIRED', message: 'This scene needs an update from its creator before it can play.',
      } })
    expect(normalizeSceneListItem({ ...scene, sceneMode: 'operator-approved' })?.sceneMode).toBeNull()
    expect(normalizeSceneListItem({ ...scene, sceneData: { kind: 'template' } })?.sceneMode).toBeNull()
  })
})

describe('fetchTags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('requests attached tags with their scene counts independently of a scene filter', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    const tags = [{ tagId: 17, name: 'Glass', sceneCount: 6 }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tags)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTags({ attachedOnly: true })).resolves.toEqual(tags)
    expect(fetchMock).toHaveBeenCalledWith('/api/tags?attachedOnly=true')
  })

  it.each(['network', 'server'] as const)('returns no tags on a %s failure instead of hardcoded options', async failure => {
    const fetchMock = failure === 'network'
      ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTags({ attachedOnly: true })).resolves.toEqual([])
  })
})
