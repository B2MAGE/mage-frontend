import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from './api'

describe('buildApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefixes relative paths with /api when no base url is configured', () => {
    expect(buildApiUrl('/users/me')).toBe('/api/users/me')
    expect(buildApiUrl('auth/login')).toBe('/api/auth/login')
  })

  it('does not duplicate an existing /api prefix', () => {
    expect(buildApiUrl('/api/presets/12')).toBe('/api/presets/12')
  })

  it('supports same-origin production routing when the base url is set to /api', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')

    expect(buildApiUrl('/users/me')).toBe('/api/users/me')
  })

  it('joins the configured base url with the normalized api path', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://mage.example.com/')

    expect(buildApiUrl('/presets/12')).toBe('https://mage.example.com/api/presets/12')
  })

  it('does not double-prefix /api when the configured base url already includes it', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://mage.example.com/api')

    expect(buildApiUrl('/presets/12')).toBe('https://mage.example.com/api/presets/12')
  })
})
