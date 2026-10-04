export const SECURITY_GROUP_CHECK_COUNTS = Object.freeze({ boundary: 17, failures: 8, stall: 2 })
const MAX_RUNS = 24
const MAX_CHECKS = 32
const bounded = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''

/** Session-only, fixed-fixture evidence. Never collect page, account, storage or scene data. */
export function createSecurityReport({ now = () => new Date().toISOString(), mode = 'local' } = {}) {
  if (!['local', 'deployed'].includes(mode)) throw new Error('Unknown fixed report scope.')
  const runs = []
  let nextId = 0
  const current = id => runs.find(run => run.id === id && run.status === 'running')
  return {
    start(group) {
      if (!Object.hasOwn(SECURITY_GROUP_CHECK_COUNTS, group)) throw new Error('Unknown security check group.')
      const run = { id: ++nextId, group, startedAt: now(), finishedAt: null, status: 'running', checks: [], interruptedByHiddenPage: false }
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
        version: 1,
        scope: mode === 'deployed' ? 'Deployed fixed-fixture checks only. Not full application verification or release approval.'
          : 'Local fixed-fixture checks only. Not production verification or release approval.',
        exportedAt: now(),
        browserUserAgent: bounded(userAgent, 512),
        parentOrigin: safeOrigin(parentOrigin),
        rendererUrl: `${safeOrigin(rendererUrl)}/index.html`,
        retainedRunLimit: MAX_RUNS,
        expectedChecks: { ...SECURITY_GROUP_CHECK_COUNTS },
        runs: structuredClone(runs),
      }
    },
  }
}
