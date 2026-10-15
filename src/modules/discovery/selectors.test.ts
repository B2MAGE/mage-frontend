import { describe, expect, it } from 'vitest'
import { normalizeDiscoverySearchParams, readDiscoveryQuery } from './selectors'

describe('Explore URL query', () => {
  it('uses a zero-based request page while leaving a clean default URL unchanged', () => {
    const params = new URLSearchParams('campaign=demo')
    expect(readDiscoveryQuery(params)).toEqual({ page: 0, size: 12, sort: 'descending', tag: null })
    expect(normalizeDiscoverySearchParams(params).toString()).toBe('campaign=demo')
  })

  it('reads page, size, sort and tag without changing unrelated parameters', () => {
    const params = new URLSearchParams('page=4&size=48&sort=most-liked&tag=warm+light&campaign=demo')
    expect(readDiscoveryQuery(params)).toEqual({ page: 3, size: 48, sort: 'most-liked', tag: 'warm light' })
    expect(normalizeDiscoverySearchParams(params).toString()).toBe(params.toString())
  })

  it.each(['0', '-1', '1.5', 'nope', 'Infinity', '1e3', '9007199254740992', '2147483648', ''])(
    'normalizes an invalid page %s to page one', page => {
      const params = new URLSearchParams({ page, tag: 'fire', campaign: 'demo' })
      expect(readDiscoveryQuery(params).page).toBe(0)
      expect(normalizeDiscoverySearchParams(params).get('page')).toBe('1')
      expect(normalizeDiscoverySearchParams(params).get('campaign')).toBe('demo')
    })

  it.each(['0', '-1', '13', '999', 'not-a-size', ''])('uses twelve for unsupported page size %s', size => {
    const params = new URLSearchParams({ size })
    expect(readDiscoveryQuery(params).size).toBe(12)
    expect(normalizeDiscoverySearchParams(params).get('size')).toBe('12')
  })

  it.each(['ascending', 'descending', 'most-viewed', 'most-liked', 'featured', 'recommended'])(
    'preserves the supported %s sort', sort => {
      expect(readDiscoveryQuery(new URLSearchParams({ sort })).sort).toBe(sort)
    })

  it('normalizes invalid or duplicate query fields without mutating its input', () => {
    const params = new URLSearchParams('page=02&page=9&size=24&size=48&sort=invalid&tag=%20fire%20&campaign=one&campaign=two')
    const original = params.toString()
    const normalized = normalizeDiscoverySearchParams(params)
    expect(normalized.toString()).toBe('page=2&size=24&sort=descending&tag=fire&campaign=one&campaign=two')
    expect(params.toString()).toBe(original)
  })

  it('removes a blank tag', () => {
    expect(normalizeDiscoverySearchParams(new URLSearchParams('tag=%20%20&sort=ascending')).toString())
      .toBe('sort=ascending')
  })
})
