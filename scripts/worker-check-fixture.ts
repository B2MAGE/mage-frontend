import { boundaryProbeSource, isBoundaryEventValue, isBoundarySummary, workerBoundaryVerdicts,
  type BoundaryEventValue, type WorkerBoundarySummary, type WorkerCanaryCounts } from './worker-boundary'

export const WORKER_CHECK_VERSION = 'fixed-worker-2'
export const WORKER_CHECK_PARENT = 'http://127.0.0.1:5178'
export const WORKER_CHECK_PATH = '/scripts/isolated-worker-check.html'
export const WORKER_CHECK_CHILD = 'http://localhost:5182/index.html'
export const WORKER_CHECK_PRODUCTION_PARENT = 'https://mage.peterbucci.com'
export const WORKER_CHECK_PRODUCTION_PATH = '/player-check/worker/'
export const WORKER_CHECK_PRODUCTION_CHILD = 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'
export type WorkerCheckScope = 'local' | 'production'
export function workerCheckConfig(scope: WorkerCheckScope) {
  if (scope === 'local') return { parentOrigin: WORKER_CHECK_PARENT, path: WORKER_CHECK_PATH, rendererUrl: WORKER_CHECK_CHILD }
  if (scope === 'production') return { parentOrigin: WORKER_CHECK_PRODUCTION_PARENT, path: WORKER_CHECK_PRODUCTION_PATH, rendererUrl: WORKER_CHECK_PRODUCTION_CHILD }
  throw new Error('Unknown fixed worker-check scope.')
}
export function isWorkerCheckLocation(scope: WorkerCheckScope, href: string, development: boolean) {
  const config = workerCheckConfig(scope)
  return (scope === 'production' || development) && href === `${config.parentOrigin}${config.path}`
}
export const WORKER_CHECK_PROTOCOL = 'mage-fixed-worker-check'
export const WORKER_CHECK_PHASES = ['control', 'normal', 'completion', 'throw', 'syntax', 'abort', 'repeat', 'stall', 'boundary', 'policy'] as const
export type WorkerCheckPhase = typeof WORKER_CHECK_PHASES[number]
export const WORKER_CHECK_MARKERS = ['scope', 'opaque-origin', 'delay-scheduled', 'delayed', 'loop-entered', 'loop-ended'] as const
export type WorkerCheckMarker = typeof WORKER_CHECK_MARKERS[number]
export type WorkerCheckSummary = {
  controlDelayed: boolean; scopeVerified: boolean; opaqueOriginObserved: boolean;
  normalStarted: boolean; normalCompiled: boolean; normalTerminated: boolean;
  completionScheduled: boolean; completionCompiled: boolean; completionTerminated: boolean; completionDelayed: boolean;
  stallStarted: boolean; stallEntered: boolean; stallEnded: boolean; stallTimedOut: boolean;
  throwStarted: boolean; throwRejected: boolean; throwTerminated: boolean;
  syntaxStarted: boolean; syntaxRejected: boolean; syntaxTerminated: boolean;
  abortStarted: boolean; abortEntered: boolean; abortCancelled: boolean;
  stallDurationMs: number; completionObservationMs: number; abortDurationMs: number; repeatedJobs: number;
  boundary: WorkerBoundarySummary;
}
export type WorkerCheckEvent = { phase: WorkerCheckPhase; kind: 'phase' | 'created' | 'dispatched' | 'started' | 'validated' | 'terminated' | 'marker' | 'boundary';
  value: null | 'complete' | 'error' | 'timeout' | 'abort' | WorkerCheckMarker | BoundaryEventValue; atMs: number }
const flagKeys = ['controlDelayed', 'scopeVerified', 'opaqueOriginObserved', 'normalStarted', 'normalCompiled', 'normalTerminated',
  'completionScheduled', 'completionCompiled', 'completionTerminated', 'completionDelayed', 'stallStarted', 'stallEntered', 'stallEnded', 'stallTimedOut',
  'throwStarted', 'throwRejected', 'throwTerminated', 'syntaxStarted', 'syntaxRejected', 'syntaxTerminated', 'abortStarted', 'abortEntered', 'abortCancelled'] as const
export const validNonce = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
export const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 60000
export function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'))
}
export function isWorkerCheckConnection(value: unknown): value is { protocol: typeof WORKER_CHECK_PROTOCOL; version: 1; type: 'connect'; nonce: string } {
  return exact(value, ['protocol', 'version', 'type', 'nonce']) && value.protocol === WORKER_CHECK_PROTOCOL
    && value.version === 1 && value.type === 'connect' && validNonce(value.nonce)
}
export function isSummary(value: unknown): value is WorkerCheckSummary {
  return exact(value, [...flagKeys, 'stallDurationMs', 'completionObservationMs', 'abortDurationMs', 'repeatedJobs', 'boundary'])
    && flagKeys.every(key => typeof value[key] === 'boolean') && time(value.stallDurationMs) && time(value.completionObservationMs) && time(value.abortDurationMs)
    && Number.isInteger(value.repeatedJobs) && (value.repeatedJobs as number) >= 0 && (value.repeatedJobs as number) <= 2 && isBoundarySummary(value.boundary)
}
export function isCheckEvent(value: unknown): value is WorkerCheckEvent {
  if (!exact(value, ['phase', 'kind', 'value', 'atMs']) || !WORKER_CHECK_PHASES.includes(value.phase as WorkerCheckPhase) || !time(value.atMs)) return false
  if (value.kind === 'marker') return WORKER_CHECK_MARKERS.includes(value.value as WorkerCheckMarker)
  if (value.kind === 'boundary') return ['boundary', 'policy'].includes(value.phase as string) && isBoundaryEventValue(value.value)
  if (value.kind === 'terminated') return ['complete', 'error', 'timeout', 'abort'].includes(value.value as string)
  return ['phase', 'created', 'dispatched', 'started', 'validated'].includes(value.kind as string) && value.value === null
}
export function readWorkerMarker(value: unknown, nonce: string): WorkerCheckMarker | null {
  return validNonce(nonce) && exact(value, ['type', 'nonce', 'marker']) && value.type === 'mage-worker-check-marker'
    && value.nonce === nonce && WORKER_CHECK_MARKERS.includes(value.marker as WorkerCheckMarker) ? value.marker as WorkerCheckMarker : null
}
export function markerSource(nonce: string, marker: WorkerCheckMarker) {
  if (!validNonce(nonce) || !WORKER_CHECK_MARKERS.includes(marker)) throw new Error('Invalid fixed worker probe.')
  return `globalThis.postMessage({type:'mage-worker-check-marker',nonce:${JSON.stringify(nonce)},marker:${JSON.stringify(marker)}});`
}
export function fixedWorkerSource(kind: Exclude<WorkerCheckPhase, 'control' | 'policy'>, nonce: string, scope: WorkerCheckScope = 'local') {
  const guard = `if(typeof globalThis.document!=='undefined'||typeof globalThis.parent!=='undefined'||typeof globalThis.window!=='undefined'||typeof globalThis.Worker!=='undefined'||typeof globalThis.SharedWorker!=='undefined')throw new Error('Worker scope unavailable');${markerSource(nonce, 'scope')}if(globalThis.location.origin==='null'){${markerSource(nonce, 'opaque-origin')}}`
  if (kind === 'normal') return `${guard}sphere(0.5);`
  if (kind === 'boundary') return `${guard}${boundaryProbeSource(scope, nonce)}sphere(0.5);`
  if (kind === 'throw') return `${guard}throw new Error('Fixed worker exception');`
  if (kind === 'syntax') return 'this is deliberately invalid worker shader source;'
  if (kind === 'repeat') return `${guard}if(typeof globalThis.__mageFixedWorkerState!=='undefined')throw new Error('Worker was reused');globalThis.__mageFixedWorkerState=1;sphere(0.5);`
  if (kind === 'completion') return `${guard}setTimeout(function(){${markerSource(nonce, 'delayed')}},250);${markerSource(nonce, 'delay-scheduled')}sphere(0.5);`
  if (kind === 'stall' || kind === 'abort') return `${guard}${markerSource(nonce, 'loop-entered')}var until=performance.now()+3000;while(performance.now()<until){}${markerSource(nonce, 'loop-ended')}sphere(0.5);`
  throw new Error('Unknown fixed worker probe.')
}
export function positiveControlSource(nonce: string) {
  return `setTimeout(function(){${markerSource(nonce, 'delayed')}},250);`
}
export function workerCheckVerdicts(summary: WorkerCheckSummary, parentGapMs: number, counts: WorkerCanaryCounts | null = null, control = false) {
  return [
    { name: 'Normal source compiles in the worker and produces validated output', passed: summary.normalStarted && summary.normalCompiled && summary.normalTerminated },
    { name: 'Worker has no document, parent, window or nested worker constructors', passed: summary.scopeVerified && summary.normalCompiled },
    { name: 'Fixed timer positive control delivers its delayed callback', passed: summary.controlDelayed },
    { name: 'Successful compilation retires the worker before its delayed callback', passed: summary.controlDelayed && summary.completionScheduled && summary.completionCompiled && summary.completionTerminated && !summary.completionDelayed && summary.completionObservationMs >= 600 },
    { name: 'Finite worker loop is terminated before its three-second limit', passed: summary.stallStarted && summary.stallEntered && !summary.stallEnded && summary.stallTimedOut && summary.stallDurationMs >= 2000 && summary.stallDurationMs < 3000 },
    { name: 'Parent remains responsive during the worker stall', passed: summary.stallEntered && time(parentGapMs) && parentGapMs < 1000 },
    { name: 'Thrown source is rejected and its worker terminated', passed: summary.throwStarted && summary.throwRejected && summary.throwTerminated },
    { name: 'Invalid syntax is rejected and its worker terminated', passed: summary.syntaxStarted && summary.syntaxRejected && summary.syntaxTerminated },
    { name: 'Cancellation terminates an active finite-loop worker', passed: summary.abortStarted && summary.abortEntered && summary.abortCancelled && summary.abortDurationMs < 2000 },
    { name: 'Repeated compilation uses fresh worker globals', passed: summary.repeatedJobs === 2 },
    ...workerBoundaryVerdicts(summary.boundary, counts, control),
  ]
}
