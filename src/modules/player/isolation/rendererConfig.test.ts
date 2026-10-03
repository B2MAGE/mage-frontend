import { describe, expect, it, vi, afterEach } from 'vitest'
import { getIsolatedRendererUrl, PRODUCTION_RENDERER_URL } from './rendererConfig'

afterEach(() => vi.unstubAllEnvs())

describe('renderer deployment configuration', () => {
  it('uses the fixed production player only for its allowed parent', () => {
    vi.stubEnv('DEV', false)
    expect(getIsolatedRendererUrl('https://mage.peterbucci.com/scenes/24')).toBe(PRODUCTION_RENDERER_URL)
    expect(() => getIsolatedRendererUrl('https://preview.peterbucci.com/')).toThrow(/not configured/)
    expect(() => getIsolatedRendererUrl('http://mage.peterbucci.com/')).toThrow(/not configured/)
    expect(() => getIsolatedRendererUrl('http://127.0.0.1:5178/')).toThrow(/not configured/)
  })

  it('uses only the two local development pairs', () => {
    vi.stubEnv('DEV', true)
    expect(getIsolatedRendererUrl('http://127.0.0.1:5178/create-scene')).toBe('http://localhost:5181/index.html')
    expect(getIsolatedRendererUrl('http://localhost:5178/')).toBe('http://127.0.0.1:5181/index.html')
    expect(() => getIsolatedRendererUrl('http://127.0.0.1:5173/')).toThrow(/not configured/)
  })
})
