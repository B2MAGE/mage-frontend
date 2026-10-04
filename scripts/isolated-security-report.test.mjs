import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSecurityReport, SECURITY_GROUP_CHECK_COUNTS } from './isolated-security-report.mjs'

const metadata = { userAgent: 'Fixture browser', parentOrigin: 'http://127.0.0.1:5178', rendererUrl: 'http://localhost:5181/index.html' }
const addPassing = (report, id, count) => { for (let i = 0; i < count; i++) report.add(id, { name: `Fixed check ${i}`, outcome: 'PASS', evidence: 'Fixed check passed.' }) }

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
