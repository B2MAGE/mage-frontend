import { afterEach, describe, expect, it, vi } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { boundaryProbeSource, BOUNDARY_PROBES, emptyBoundaryEvidence, isBoundaryEvidence, isBoundarySummary,
  readBoundaryMarker, recordBoundaryMarker, workerBoundaryVerdicts, workerCanaryUrl, type WorkerBoundarySummary } from './worker-boundary'
import { fixedWorkerSource } from './worker-check-fixture'
import { prepareWorkerCanary, readWorkerCanary } from './worker-check-canary'

const nonce = 'a'.repeat(32), controlNonce = 'b'.repeat(32)
const zero = { requests: 0, kinds: { fetch: 0, xhr: 0, 'import-script': 0 } }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
function passing(): WorkerBoundarySummary {
  const production = emptyBoundaryEvidence(), policy = emptyBoundaryEvidence()
  for (const probe of BOUNDARY_PROBES) {
    production.probes[probe] = { attempted: true, returned: true, outcome: 'pending' }
    policy.probes[probe] = { attempted: true, returned: false, outcome: 'denied' }
  }
  policy.observationTimer = true
  return { started: true, compiled: true, terminated: true, production, policy, policyObservationMs: 600 }
}

describe('fixed worker boundary evidence', () => {
  it('requires attempted and settled API results, observation control, and independently working canary counters', () => {
    expect(workerBoundaryVerdicts(passing(), zero, true).every(row => row.passed)).toBe(true)
    for (const probe of BOUNDARY_PROBES) {
      const missingAttempt = passing(); missingAttempt.policy.probes[probe].attempted = false
      expect(workerBoundaryVerdicts(missingAttempt, zero, true).every(row => row.passed)).toBe(false)
      for (const outcome of ['pending', 'allowed', 'unavailable'] as const) {
        const value = passing(); value.policy.probes[probe].outcome = outcome
        expect(workerBoundaryVerdicts(value, zero, true).every(row => row.passed)).toBe(false)
      }
    }
    expect(workerBoundaryVerdicts(passing(), zero, false).filter(row => row.name.includes('canary')).every(row => !row.passed)).toBe(true)
    expect(workerBoundaryVerdicts(passing(), null, true).every(row => row.passed)).toBe(false)
    for (const key of ['started', 'compiled', 'terminated'] as const) {
      const value = passing(); value[key] = false
      expect(workerBoundaryVerdicts(value, zero, true)[1].passed).toBe(false)
    }
    const access = passing(); access.production.probes['cache-storage'].outcome = 'allowed'
    expect(workerBoundaryVerdicts(access, zero, true)[1].passed).toBe(false)
    const absentTimer = passing(); absentTimer.policy.observationTimer = false
    expect(workerBoundaryVerdicts(absentTimer, zero, true).slice(2).every(row => !row.passed)).toBe(true)
    expect(workerBoundaryVerdicts(passing(), { ...zero, requests: 1 }, true).slice(3, 6).every(row => !row.passed)).toBe(true)
  })

  it('accepts only fixed bounded evidence and rejects duplicate/out-of-order proof', () => {
    const valid = { type: 'mage-worker-boundary-marker', nonce, probe: 'fetch', outcome: 'attempted' }
    expect(readBoundaryMarker(valid, nonce)).toEqual({ probe: 'fetch', outcome: 'attempted' })
    for (const value of [{ ...valid, source: 'excluded' }, { ...valid, outcome: 'raw-error' }, { ...valid, nonce: controlNonce },
      { ...valid, probe: 'arbitrary-url' }, { ...valid, probe: 'observation', outcome: 'allowed' }, null]) expect(readBoundaryMarker(value, nonce)).toBeNull()
    expect(isBoundarySummary(passing())).toBe(true)
    expect(isBoundarySummary({ ...passing(), policyObservationMs: Infinity })).toBe(false)
    expect(isBoundaryEvidence({ ...emptyBoundaryEvidence(), storage: 'excluded' })).toBe(false)
    const evidence = emptyBoundaryEvidence()
    recordBoundaryMarker(evidence, { probe: 'fetch', outcome: 'denied' })
    expect(evidence.valid).toBe(false)
    const duplicate = emptyBoundaryEvidence()
    recordBoundaryMarker(duplicate, { probe: 'fetch', outcome: 'attempted' })
    recordBoundaryMarker(duplicate, { probe: 'fetch', outcome: 'attempted' })
    expect(duplicate.valid).toBe(false)
  })

  it('distinguishes a CacheStorage API not exposed by the browser from a denied opening', () => {
    const value = passing()
    value.production.probes['cache-storage'] = { attempted: true, returned: false, outcome: 'not-exposed' }
    value.policy.probes['cache-storage'] = { attempted: true, returned: false, outcome: 'not-exposed' }
    expect(isBoundarySummary(value)).toBe(true)
    const verdicts = workerBoundaryVerdicts(value, zero, true)
    expect(verdicts.every(row => row.passed)).toBe(true)
    expect(verdicts.at(-1)!.name).toContain('NOT_EXPOSED')
    expect(verdicts.at(-1)!.name).not.toContain('denies opening')
    value.production.probes['cache-storage'].returned = true
    expect(workerBoundaryVerdicts(value, zero, true)[1].passed).toBe(false)
    value.policy.probes['cache-storage'].returned = true
    expect(workerBoundaryVerdicts(value, zero, true).at(-1)!.passed).toBe(false)
    expect(readBoundaryMarker({ type: 'mage-worker-boundary-marker', nonce, probe: 'fetch', outcome: 'not-exposed' }, nonce)).toBeNull()
  })

  it.each(['absent', 'throwing-getter', 'malformed', 'available-denial'] as const)('executes and classifies the actual CacheStorage probe: %s', async exposure => {
    const messages: unknown[] = []
    vi.stubGlobal('postMessage', (message: unknown) => messages.push(message))
    vi.stubGlobal('location', { origin: 'null' })
    vi.stubGlobal('fetch', undefined); vi.stubGlobal('XMLHttpRequest', undefined)
    vi.stubGlobal('importScripts', undefined); vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('caches', undefined)
    if (exposure === 'absent') Reflect.deleteProperty(globalThis, 'caches')
    else if (exposure === 'throwing-getter') Object.defineProperty(globalThis, 'caches', {
      configurable: true, get() { throw new DOMException('Fixed denial', 'SecurityError') },
    })
    else if (exposure === 'available-denial') vi.stubGlobal('caches', { open: () => Promise.reject(new DOMException('Fixed denial', 'SecurityError')) })
    compileShader(fixedWorkerSource('boundary', nonce), { maxRaymarchIterations: 48 })
    await Promise.resolve(); await Promise.resolve()
    const evidence = emptyBoundaryEvidence()
    messages.forEach(message => { const marker = readBoundaryMarker(message, nonce); if (marker) recordBoundaryMarker(evidence, marker) })
    expect(evidence.valid).toBe(true)
    expect(evidence.probes['cache-storage']).toEqual({ attempted: true, returned: exposure === 'available-denial',
      outcome: exposure === 'absent' ? 'not-exposed' : exposure === 'malformed' ? 'unavailable' : 'denied' })
  })

  it('executes the fixed API attempts through the installed compiler without real network or existing storage access', async () => {
    const messages: unknown[] = []
    vi.stubGlobal('postMessage', (message: unknown) => messages.push(message))
    vi.stubGlobal('location', { origin: 'null' })
    const denied = () => { throw new DOMException('fixed', 'SecurityError') }
    const fetch = vi.fn(async () => { throw new Error('fixed') })
    const open = vi.fn(), send = vi.fn(denied)
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('XMLHttpRequest', class { open = open; send = send; withCredentials = false })
    const importScripts = vi.fn(denied), indexedOpen = vi.fn(denied), cacheOpen = vi.fn(async () => { throw new Error('fixed') })
    vi.stubGlobal('importScripts', importScripts); vi.stubGlobal('indexedDB', { open: indexedOpen }); vi.stubGlobal('caches', { open: cacheOpen })
    const artifact = compileShader(fixedWorkerSource('boundary', nonce, 'production'), { maxRaymarchIterations: 48 })
    expect(normalizeCompiledShader(artifact, { maxRaymarchIterations: 48 }).frag.length).toBeGreaterThan(0)
    await Promise.resolve(); await Promise.resolve()
    const evidence = emptyBoundaryEvidence()
    messages.forEach(message => { const marker = readBoundaryMarker(message, nonce); if (marker) recordBoundaryMarker(evidence, marker) })
    expect(evidence.valid).toBe(true)
    expect(BOUNDARY_PROBES.every(probe => evidence.probes[probe].attempted && evidence.probes[probe].outcome === 'denied')).toBe(true)
    expect(fetch).toHaveBeenCalledWith(workerCanaryUrl('production', nonce, 'fetch'), { mode: 'no-cors', credentials: 'omit', cache: 'no-store' })
    expect(open).toHaveBeenCalledWith('GET', workerCanaryUrl('production', nonce, 'xhr'), false)
    expect(importScripts).toHaveBeenCalledWith(workerCanaryUrl('production', nonce, 'import-script'))
    expect(indexedOpen).toHaveBeenCalledWith(`mage-fixed-worker-${nonce}`, 1)
    expect(cacheOpen).toHaveBeenCalledWith(`mage-fixed-worker-${nonce}`)
    expect(() => boundaryProbeSource('production', 'invalid')).toThrow()
    expect(() => workerCanaryUrl('production', nonce, 'socket' as never)).toThrow()
  })
})

describe('worker canary positive control', () => {
  const response = (value: unknown, ok = true) => ({ ok, json: async () => value } as Response)
  it('registers separate nonces, observes every counter, and omits credentials on every request', async () => {
    const reads = vi.fn<typeof fetch>().mockResolvedValue(response({ received: true }))
    reads.mockResolvedValueOnce(response({ registered: true }))
      .mockResolvedValueOnce(response({ received: true })).mockResolvedValueOnce(response({ received: true })).mockResolvedValueOnce(response({ received: true }))
      .mockResolvedValueOnce(response({ requests: 3, kinds: { fetch: 1, xhr: 1, 'import-script': 1 } }))
      .mockResolvedValueOnce(response({ registered: true }))
    const signal = new AbortController().signal
    await expect(prepareWorkerCanary('production', controlNonce, nonce, signal, reads)).resolves.toMatchObject({ requests: 3 })
    expect(reads).toHaveBeenCalledTimes(6)
    for (const [url, options] of reads.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/mage\.peterbucci\.com\/player-check\/__isolated-security\/(register|results|canary)\?/)
      expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store', signal })
    }
    expect(reads.mock.calls.at(-1)![0]).toContain(`register?nonce=${nonce}`)
  })
  it('cannot accept zero requests when the positive control or collector failed', async () => {
    for (const counts of [zero, { requests: 3, kinds: { fetch: 1, xhr: 0, 'import-script': 2 } }]) {
      const read = vi.fn<typeof fetch>().mockResolvedValue(response(counts))
      read.mockResolvedValueOnce(response({ registered: true }))
      await expect(prepareWorkerCanary('local', controlNonce, nonce, new AbortController().signal, read)).rejects.toThrow(/positive control/)
      expect(read.mock.calls.some(([url]) => String(url).includes(`register?nonce=${nonce}`))).toBe(false)
    }
    await expect(readWorkerCanary('local', nonce, new AbortController().signal, vi.fn().mockResolvedValue(response(zero, false)))).rejects.toThrow()
    for (const value of [{ ...zero, requests: 1001 }, { ...zero, kinds: { ...zero.kinds, xhr: '0' } }]) {
      await expect(readWorkerCanary('local', nonce, new AbortController().signal, vi.fn().mockResolvedValue(response(value)))).rejects.toThrow()
    }
  })
  it.each([null, {}, { requests: 0 }, { kinds: zero.kinds }, { requests: 0, kinds: {} },
    { requests: 0, kinds: { fetch: 0, xhr: 0 } }, { requests: 0, kinds: { fetch: 0, 'import-script': 0 } },
    { requests: 0, kinds: { xhr: 0, 'import-script': 0 } }])('rejects missing or partial counter evidence: %j', async value => {
    await expect(readWorkerCanary('production', nonce, new AbortController().signal,
      vi.fn().mockResolvedValue(response(value)))).rejects.toThrow('Invalid fixed canary counts')
  })
  it('does not register the probe nonce when positive-control counts are partial', async () => {
    const read = vi.fn<typeof fetch>().mockResolvedValue(response({ requests: 3, kinds: { fetch: 1, xhr: 1 } }))
    read.mockResolvedValueOnce(response({ registered: true }))
    await expect(prepareWorkerCanary('production', controlNonce, nonce, new AbortController().signal, read)).rejects.toThrow('Invalid fixed canary counts')
    expect(read.mock.calls.some(([url]) => String(url).includes(`register?nonce=${nonce}`))).toBe(false)
  })
})
