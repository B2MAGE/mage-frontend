export const SECURITY_GROUP_CHECK_COUNTS = Object.freeze({ boundary: 17, failures: 8, stall: 2 })
export const SECURITY_DIAGNOSTIC_LIMIT = 256
export const SECURITY_TEST_VERSION = 'fixed-security-2'
const MAX_RUNS = 24
const MAX_CHECKS = 32
const bounded = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
const phases = ['baseline-startup', 'baseline', 'stall-startup', 'stall', 'recovery', 'cleanup']
// Current host diagnostics can report compilation rejection. Accepting this fixed
// reason does not turn the historical window-thread probes into worker coverage.
const failures = ['runtime', 'context-lost', 'startup-timeout', 'progress-timeout', 'compile']
const time = value => Number.isFinite(value) && value >= 0 && value <= 86400000
const signedTime = value => Number.isFinite(value) && Math.abs(value) <= 86400000
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
function diagnostic(value) {
  if (!value || typeof value.type !== 'string' || !phases.includes(value.phase) || !time(value.atMs)) return null
  const base = ['type', 'phase', 'atMs']
  const fields = {
    phase: {},
    status: { status: ['starting', 'ready', 'loading', 'playing', 'paused', 'error', 'disposed'].includes(value.status) },
    progress: {},
    watchdog: { deltaMs: signedTime(value.deltaMs), silenceMs: time(value.silenceMs), progressAgeMs: signedTime(value.progressAgeMs),
      resetReason: ['closed', 'not-loaded', 'paused', 'hidden', 'invalid-clock', 'parent-gap', 'recent-progress', 'none'].includes(value.resetReason) },
    failure: { reason: failures.includes(value.reason) },
    marker: { marker: ['queued', 'scheduled', 'start', 'end'].includes(value.marker), childAtMs: time(value.childAtMs) },
    'parent-timer': { gapMs: time(value.gapMs) },
    visibility: { state: ['visible', 'hidden'].includes(value.state) },
  }
  if (!Object.hasOwn(fields, value.type)) return null
  const checks = fields[value.type]
  return exact(value, [...base, ...Object.keys(checks)]) && Object.values(checks).every(Boolean) ? { ...value } : null
}
function stallObservation(value) {
  const fields = ['elapsedMs', 'maxParentGapMs', 'failureReason', 'failureCallbackAtMs', 'iframeConnected', 'markerQueued', 'markerScheduled', 'markerStarted', 'markerEnded']
  if (!exact(value, fields) || !time(value.elapsedMs) || !time(value.maxParentGapMs)
    || !(value.failureReason === null || failures.includes(value.failureReason))
    || !(value.failureCallbackAtMs === null || time(value.failureCallbackAtMs))
    || (value.failureReason === null) !== (value.failureCallbackAtMs === null)
    || fields.slice(4).some(key => typeof value[key] !== 'boolean')) return null
  return { ...value }
}

/** Session-only, fixed-fixture evidence. Never collect page, account, storage or scene data. */
export function createSecurityReport({ now = () => new Date().toISOString(), mode = 'local' } = {}) {
  if (!['local', 'deployed'].includes(mode)) throw new Error('Unknown fixed report scope.')
  const runs = []
  let nextId = 0
  const current = id => runs.find(run => run.id === id && run.status === 'running')
  return {
    start(group) {
      if (typeof group !== 'string' || !Object.hasOwn(SECURITY_GROUP_CHECK_COUNTS, group)) throw new Error('Unknown security check group.')
      const run = { id: ++nextId, group, startedAt: now(), finishedAt: null, status: 'running', checks: [], interruptedByHiddenPage: false,
        ...(group === 'stall' ? { diagnostics: { eventLimit: SECURITY_DIAGNOSTIC_LIMIT, events: [], truncated: false, droppedEvents: 0, rejectedEvents: 0 },
          stall: { baseline: null, observation: null, recovery: null, beforeCleanup: null } } : {}) }
      runs.push(run)
      if (runs.length > MAX_RUNS) runs.shift()
      return run.id
    },
    add(id, { name, outcome, evidence }) {
      const run = current(id)
      if (!run || !['PASS', 'FAIL', 'PENDING'].includes(outcome) || run.checks.length >= MAX_CHECKS) return
      run.checks.push({ name: bounded(name, 120), outcome, evidence: bounded(evidence, 512) })
    },
    markHidden(id) {
      const run = current(id)
      if (run) run.interruptedByHiddenPage = true
    },
    diagnostic(id, value) {
      const run = current(id)
      if (!run?.diagnostics) return
      const entry = diagnostic(value)
      if (!entry) { run.diagnostics.rejectedEvents = Math.min(1000000, run.diagnostics.rejectedEvents + 1); return }
      if (run.diagnostics.events.length >= SECURITY_DIAGNOSTIC_LIMIT) {
        run.diagnostics.truncated = true
        run.diagnostics.droppedEvents = Math.min(1000000, run.diagnostics.droppedEvents + 1)
      } else run.diagnostics.events.push(entry)
    },
    observeStall(id, phase, value) {
      const run = current(id), entry = stallObservation(value)
      if (!run?.stall || !['baseline', 'observation', 'recovery', 'beforeCleanup'].includes(phase) || !entry || run.stall[phase] !== null) return
      // Each observation is immutable; later recovery or explicit cleanup cannot revise the verdict evidence.
      run.stall[phase] = entry
    },
    finish(id, cancelled = false) {
      const run = current(id)
      if (!run) return
      const complete = run.checks.length === SECURITY_GROUP_CHECK_COUNTS[run.group] && run.checks.every(check => check.outcome === 'PASS')
      run.status = cancelled ? 'cancelled' : complete && !run.interruptedByHiddenPage ? 'passed' : 'failed'
      run.finishedAt = now()
    },
    snapshot({ userAgent, parentOrigin, rendererUrl }) {
      // Locations are reduced to origins and the fixed entry path; query/fragment data is never exported.
      const safeOrigin = value => { try { return new URL(value).origin } catch { return 'unknown' } }
      return {
        version: 2,
        testVersion: SECURITY_TEST_VERSION,
        scope: mode === 'deployed' ? 'Deployed fixed-fixture checks only. Not full application verification or release approval.'
          : 'Local fixed-fixture checks only. Not production verification or release approval.',
        exportedAt: now(),
        browserUserAgent: bounded(userAgent, 512),
        parentOrigin: safeOrigin(parentOrigin),
        rendererUrl: `${safeOrigin(rendererUrl)}/index.html`,
        retainedRunLimit: MAX_RUNS,
        expectedChecks: { ...SECURITY_GROUP_CHECK_COUNTS },
        stallParameters: { baselineObservationMs: 1200, stallObservationMs: 3600, recoveryObservationMs: 1200,
          childDelayMs: 150, childLoopMs: 3000, parentTimerIntervalMs: 50, parentResponsivenessLimitMs: 1000,
          fixtureProgressTimeoutMs: 1000, fixtureStartupTimeoutMs: mode === 'deployed' ? 15000 : 1200,
          productionDefaultProgressTimeoutMs: 10000 },
        runs: structuredClone(runs),
      }
    },
  }
}
