import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSecurityReport, SECURITY_GROUP_CHECK_COUNTS, SECURITY_DIAGNOSTIC_LIMIT, SECURITY_TEST_VERSION } from './isolated-security-report.mjs'

const metadata = { userAgent: 'Fixture browser', parentOrigin: 'http://127.0.0.1:5178', rendererUrl: 'http://localhost:5181/index.html' }
const addPassing = (report, id, count) => { for (let i = 0; i < count; i++) report.add(id, { name: `Fixed check ${i}`, outcome: 'PASS', evidence: 'Fixed check passed.' }) }

test('deployed reports identify fixed-fixture evidence without granting release approval', () => {
  const report = createSecurityReport({ mode: 'deployed' }).snapshot(metadata)
  assert.match(report.scope, /^Deployed fixed-fixture checks only\./)
  assert.match(report.scope, /Not full application verification or release approval\./)
  assert.equal(report.version, 2)
  assert.equal(report.testVersion, SECURITY_TEST_VERSION)
  assert.equal(report.stallParameters.fixtureProgressTimeoutMs, 1000)
  assert.equal(report.stallParameters.productionDefaultProgressTimeoutMs, 10000)
  assert.equal(report.stallParameters.fixtureStartupTimeoutMs, 15000)
  assert.throws(() => createSecurityReport({ mode: 'approved' }), /Unknown/)
})

test('stall diagnostic timeline rejects unknown fields and values, bounds numbers, and reports truncation', () => {
  const report = createSecurityReport(), id = report.start('stall')
  const valid = { type: 'watchdog', phase: 'stall', atMs: 3700, deltaMs: 3500, silenceMs: 0, progressAgeMs: 3600, resetReason: 'parent-gap' }
  report.diagnostic(id, valid)
  const invalid = [null, [], { type: ['phase'], phase: 'stall', atMs: 1 }, { type: { toString: () => 'phase' }, phase: 'stall', atMs: 1 },
    { ...valid, account: 'excluded' }, { ...valid, phase: 'arbitrary-source' }, { ...valid, type: 'raw-message' },
    { ...valid, resetReason: 'unbounded' }, ...[Infinity, NaN, -1, 86400001, '3'].map(atMs => ({ ...valid, atMs })),
    { ...valid, deltaMs: -86400001 }, { ...valid, silenceMs: -1 }, { type: 'marker', phase: 'stall', atMs: 100, marker: 'executed', childAtMs: 0 },
    { type: 'failure', phase: 'stall', atMs: 100, reason: 'private' }, { type: 'status', phase: 'stall', atMs: 100, status: 'secret' }]
  invalid.forEach(value => report.diagnostic(id, value))
  for (let i = 0; i < SECURITY_DIAGNOSTIC_LIMIT + 10; i++) report.diagnostic(id, { type: 'progress', phase: 'stall', atMs: i })
  const result = report.snapshot(metadata).runs[0].diagnostics
  assert.equal(result.events.length, SECURITY_DIAGNOSTIC_LIMIT)
  assert.equal(result.truncated, true)
  assert.equal(result.droppedEvents, 11)
  assert.equal(result.rejectedEvents, invalid.length)
  assert.deepEqual(result.events[0], valid)
  assert(!JSON.stringify(result).includes('excluded'))
  result.events[0].resetReason = 'edited'
  assert.equal(report.snapshot(metadata).runs[0].diagnostics.events[0].resetReason, 'parent-gap')
})

test('original observations and cancelled-run diagnostics cannot be revised by later recovery or another run', () => {
  const report = createSecurityReport(), id = report.start('stall')
  const observed = { elapsedMs: 3600, maxParentGapMs: 3807, failureReason: null, failureCallbackAtMs: null, iframeConnected: true,
    markerQueued: true, markerScheduled: true, markerStarted: true, markerEnded: true }
  report.observeStall(id, 'observation', { ...observed, rawError: 'excluded' })
  assert.equal(report.snapshot(metadata).runs[0].stall.observation, null)
  report.observeStall(id, 'observation', observed)
  report.observeStall(id, 'observation', { ...observed, maxParentGapMs: 50 })
  report.observeStall(id, 'recovery', { ...observed, elapsedMs: 1200, maxParentGapMs: 50 })
  report.observeStall(id, 'beforeCleanup', observed)
  report.finish(id, true)
  const next = report.start('stall')
  report.diagnostic(id, { type: 'progress', phase: 'stall', atMs: 5000 })
  report.observeStall(id, 'baseline', observed)
  report.observeStall(next, 'observation', { ...observed, failureReason: 'progress-timeout', failureCallbackAtMs: null })
  const result = report.snapshot(metadata).runs
  assert.equal(result[0].stall.observation.maxParentGapMs, 3807)
  assert.equal(result[0].stall.recovery.maxParentGapMs, 50)
  assert.equal(result[0].stall.beforeCleanup.iframeConnected, true)
  assert.equal(result[0].stall.baseline, null)
  assert.equal(result[0].diagnostics.events.length, 0)
  assert.equal(result[1].stall.observation, null)
})

test('retains independent groups and requires complete passing evidence', () => {
  const report = createSecurityReport({ now: () => '2026-10-04T00:00:00.000Z' })
  for (const [group, count] of Object.entries(SECURITY_GROUP_CHECK_COUNTS)) {
    const id = report.start(group)
    addPassing(report, id, count)
    report.finish(id)
  }
  const result = report.snapshot(metadata)
  assert.deepEqual(result.runs.map(run => [run.group, run.status]), [['boundary', 'passed'], ['failures', 'passed'], ['stall', 'passed']])
  const incomplete = report.start('boundary')
  addPassing(report, incomplete, 1)
  report.finish(incomplete)
  assert.equal(report.snapshot(metadata).runs.at(-1).status, 'failed')
})

test('cancellation, failure, and background interruption never pass or accept late results', () => {
  const report = createSecurityReport()
  const cancelled = report.start('stall')
  addPassing(report, cancelled, 2)
  report.finish(cancelled, true)
  report.add(cancelled, { name: 'Late message', outcome: 'PASS', evidence: 'Ignored.' })
  report.finish(cancelled)
  const failed = report.start('stall')
  addPassing(report, failed, 1)
  report.add(failed, { name: 'Failed check', outcome: 'FAIL', evidence: 'Check failed.' })
  report.finish(failed)
  const hidden = report.start('stall')
  addPassing(report, hidden, 2)
  report.markHidden(hidden)
  report.finish(hidden)
  const running = report.start('stall')
  assert.deepEqual(report.snapshot(metadata).runs.map(run => run.status), ['cancelled', 'failed', 'failed', 'running'])
  assert.equal(report.snapshot(metadata).runs[0].checks.length, 2)
  assert.equal(report.snapshot(metadata).runs.at(-1).id, running)
})

test('exports only bounded allowlisted fields without URL credentials, query or fragment', () => {
  const report = createSecurityReport()
  for (let i = 0; i < 30; i++) {
    const id = report.start('boundary')
    for (let j = 0; j < 40; j++) report.add(id, { name: 'n'.repeat(200), outcome: 'PASS', evidence: 'e'.repeat(900), token: 'excluded' })
    report.finish(id)
  }
  const snapshot = report.snapshot({ ...metadata, userAgent: 'u'.repeat(900), parentOrigin: 'http://name:private@127.0.0.1:5178/path?token=private#private', rendererUrl: 'http://name:private@localhost:5181/?token=private#private', account: { token: 'excluded' } })
  assert.equal(snapshot.runs.length, 24)
  assert.equal(snapshot.runs[0].checks.length, 32)
  assert.equal(snapshot.runs[0].checks[0].name.length, 120)
  assert.equal(snapshot.runs[0].checks[0].evidence.length, 512)
  assert.equal(snapshot.browserUserAgent.length, 512)
  assert.equal(snapshot.parentOrigin, metadata.parentOrigin)
  assert.equal(snapshot.rendererUrl, metadata.rendererUrl)
  assert(!JSON.stringify(snapshot).includes('private'))
  assert(!JSON.stringify(snapshot).includes('excluded'))
  snapshot.runs[0].checks.length = 0
  assert.equal(report.snapshot(metadata).runs[0].checks.length, 32)
  assert.throws(() => report.start('arbitrary-source'), /Unknown/)
})
