import { NETWORK_PROBES, workerCanaryBase, workerCanaryUrl, type WorkerCanaryCounts } from './worker-boundary'
import type { WorkerCheckScope } from './worker-check-fixture'

type Read = typeof fetch
const validNonce = (nonce: string) => /^[a-f0-9]{32}$/.test(nonce)
const count = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000
export async function readWorkerCanary(scope: WorkerCheckScope, nonce: string, signal: AbortSignal, read: Read = fetch): Promise<WorkerCanaryCounts> {
  if (!validNonce(nonce)) throw new Error('Invalid fixed canary identifier.')
  const response = await read(`${workerCanaryBase(scope)}results?nonce=${nonce}`, { credentials: 'omit', cache: 'no-store', signal })
  if (!response.ok) throw new Error('Fixed canary results unavailable.')
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('requests' in body) || !count(body.requests)
    || !('kinds' in body) || !body.kinds || typeof body.kinds !== 'object'
    || !NETWORK_PROBES.every(kind => count((body.kinds as Record<string, unknown>)[kind]))) throw new Error('Invalid fixed canary counts.')
  return { requests: body.requests, kinds: Object.fromEntries(NETWORK_PROBES.map(kind =>
    [kind, (body.kinds as Record<string, number>)[kind]])) as WorkerCanaryCounts['kinds'] }
}
export async function prepareWorkerCanary(scope: WorkerCheckScope, controlNonce: string, probeNonce: string,
  signal: AbortSignal, read: Read = fetch) {
  if (!validNonce(controlNonce) || !validNonce(probeNonce) || controlNonce === probeNonce) throw new Error('Invalid fixed canary identifiers.')
  async function register(nonce: string) {
    const result = await read(`${workerCanaryBase(scope)}register?nonce=${nonce}`, { method: 'POST', credentials: 'omit', cache: 'no-store', signal })
    if (!result.ok || (await result.json()).registered !== true) throw new Error('Fixed canary registration unavailable.')
  }
  await register(controlNonce)
  for (const kind of NETWORK_PROBES) {
    const result = await read(workerCanaryUrl(scope, controlNonce, kind), { credentials: 'omit', cache: 'no-store', signal })
    if (!result.ok) throw new Error('Fixed canary positive control unavailable.')
  }
  const control = await readWorkerCanary(scope, controlNonce, signal, read)
  if (control.requests !== NETWORK_PROBES.length || !NETWORK_PROBES.every(kind => control.kinds[kind] === 1)) {
    throw new Error('Fixed canary positive control did not observe every request.')
  }
  await register(probeNonce)
  return control
}
