import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, fetchTags, normalizeSceneListItem } from './api'

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
