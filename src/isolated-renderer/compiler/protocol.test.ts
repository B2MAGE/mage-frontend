import { describe, expect, it, vi } from 'vitest'
import { COMPILER_LIMITS, COMPILER_PROTOCOL, COMPILER_VERSION, isCompileRequest } from './protocol'

const request = () => ({ protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, type: 'compile',
  jobId: 'a'.repeat(32), channelId: 'b'.repeat(32), sceneRevision: 3, source: 'sphere(0.5);', maxRaymarchIterations: 200 })

describe('compiler request boundary', () => {
  it('accepts only the current versioned data contract', () => {
    expect(isCompileRequest(request())).toBe(true)
    expect(isCompileRequest(Object.assign(Object.create(null), request()))).toBe(true)
    expect(isCompileRequest({ ...request(), version: 1 })).toBe(false)
    expect(isCompileRequest({ ...request(), url: 'https://example.com/worker.js' })).toBe(false)
  })

  it('rejects executable and inherited fields without invoking getters', () => {
    const getter = vi.fn(() => 'sphere(0.5);')
    const value = request()
    Object.defineProperty(value, 'source', { get: getter, enumerable: true })
    expect(isCompileRequest(value)).toBe(false)
    expect(getter).not.toHaveBeenCalled()
    expect(isCompileRequest(Object.create(request()))).toBe(false)
    expect(isCompileRequest({ ...request(), source: () => {} })).toBe(false)
    expect(isCompileRequest({ ...request(), [Symbol('source')]: 'sphere(1);' })).toBe(false)
  })

  it.each(['jobId', 'channelId'])('requires a fixed-format %s', field => {
    for (const value of ['', 'a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32), 1, null]) {
      expect(isCompileRequest({ ...request(), [field]: value })).toBe(false)
    }
  })

  it('bounds source by UTF-8 bytes and the host ceiling independently of source contents', () => {
    expect(isCompileRequest({ ...request(), source: 'é'.repeat(COMPILER_LIMITS.sourceBytes / 2) })).toBe(true)
    expect(isCompileRequest({ ...request(), source: 'é'.repeat(COMPILER_LIMITS.sourceBytes / 2 + 1) })).toBe(false)
    for (const value of [0, 201, 1.5, NaN, Infinity, '200']) {
      expect(isCompileRequest({ ...request(), maxRaymarchIterations: value })).toBe(false)
    }
    for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isCompileRequest({ ...request(), sceneRevision: value })).toBe(false)
    }
  })
})
