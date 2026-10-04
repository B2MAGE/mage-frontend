import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { boundedStallSource, portAttackSource, readStallMarker, THROW_PROBE_SOURCE } from './isolated-security-probes.mjs'

const source = readFileSync(new URL('../node_modules/@notrac/mage/dist/mage-engine.js', import.meta.url), 'utf8')
const start = source.indexOf('var require_shader_park_core_umd =')
const end = source.indexOf('\n//#endregion', start)
if (start < 0 || end <= start) throw new Error('Installed ShaderPark compiler was not found.')
const nonce = 'a'.repeat(32)
for (const mode of ['window', 'spoof', 'flood']) test(`fixed ${mode} probe compiles and executes through the installed ShaderPark parser`, () => {
  const portMessages = [], windowMessages = [], scheduled = []
  class Port { postMessage(message) { portMessages.push(message) } }
  const context = { MessagePort: Port, parent: { postMessage(message) { windowMessages.push(message) } },
    setTimeout(callback, milliseconds) { assert.equal(milliseconds, 150); scheduled.push(callback) },
    console: { log() {}, warn() {}, error() {} },
    __commonJSMin: factory => () => { const module = { exports: {} }; factory(module.exports, module); return module.exports },
    shader: `sphere(0.5); ${portAttackSource(mode, nonce)}` }
  // This fixed probe runs only in Node's isolated test context, never the app parent.
  // No network, DOM, timers, credentials or arbitrary imported source is provided.
  const result = runInNewContext(`${source.slice(start, end)}; require_shader_park_core_umd().sculptToGLSL(shader);`, context, { timeout: 3000 })
  assert.equal(result.error, undefined)
  new Port().postMessage({ protocol: 'mage-isolated-renderer', type: 'progress', session: 'test', generation: 1, requestId: 0, payload: { frames: 1 } })
  assert.equal(windowMessages[0].nonce, nonce)
  assert.equal(windowMessages[0].checks['probe-executed'], true)
  assert.equal(portMessages.length, 1, 'Destructive port probes wait until their evidence can be delivered.')
  scheduled.forEach(callback => callback())
  if (mode === 'window') { assert.equal(windowMessages[1].type, 'error'); assert.equal(portMessages.length, 1) }
  if (mode === 'spoof') { assert.equal(portMessages[1].type, 'navigate'); assert.equal(portMessages.length, 2) }
  if (mode === 'flood') assert.equal(portMessages.length, 51)
})
test('fixed thrown-source probe reaches its deliberate error in the installed parser', () => {
  const context = { console: { log() {}, warn() {}, error() {} },
    __commonJSMin: factory => () => { const module = { exports: {} }; factory(module.exports, module); return module.exports },
    shader: `sphere(0.5); ${THROW_PROBE_SOURCE}` }
  assert.throws(() => runInNewContext(`${source.slice(start, end)}; require_shader_park_core_umd().sculptToGLSL(shader);`, context, { timeout: 3000 }), /Fixed isolation throw probe/)
})

test('finite CPU probe distinguishes queued, scheduled, start and end through the installed parser', () => {
  const windowMessages = [], scheduled = []
  let clock = 0
  const context = { parent: { postMessage(message) { windowMessages.push(message) } },
    performance: { now() { clock += 100; return clock } },
    setTimeout(callback, milliseconds) { assert.equal(milliseconds, 150); scheduled.push(callback) },
    console: { log() {}, warn() {}, error() {} },
    __commonJSMin: factory => () => { const module = { exports: {} }; factory(module.exports, module); return module.exports },
    shader: `sphere(0.5); ${boundedStallSource(nonce)}` }
  const result = runInNewContext(`${source.slice(start, end)}; require_shader_park_core_umd().sculptToGLSL(shader);`, context, { timeout: 3000 })
  assert.equal(result.error, undefined)
  assert.equal(windowMessages[0].nonce, nonce)
  assert.deepEqual(windowMessages.map(message => message.marker), ['queued', 'scheduled'])
  assert.equal(windowMessages.some(message => message.marker === 'start'), false, 'Scheduling is not execution evidence.')
  assert.equal(scheduled.length, 1)
  // Advance a fake clock instead of occupying a real CPU for three seconds.
  scheduled[0]()
  assert.deepEqual(windowMessages.map(message => message.marker), ['queued', 'scheduled', 'start', 'end'])
  assert(windowMessages[3].atMs - windowMessages[2].atMs >= 3000)
  assert(windowMessages.every(message => readStallMarker({ source: context.parent, origin: 'null', data: message }, context.parent, nonce)))
})

test('stall marker rejects wrong frame, origin, nonce, extra fields, unknown markers and invalid timestamps', () => {
  const frame = {}, other = {}, data = { type: 'mage-isolation-stall', nonce, marker: 'start', atMs: 150 }
  const event = { source: frame, origin: 'null', data }
  assert.deepEqual(readStallMarker(event, frame, nonce), { marker: 'start', atMs: 150 })
  for (const invalid of [{ ...event, source: other }, { ...event, origin: 'https://renderer.example' },
    ...[{ ...data, nonce: 'b'.repeat(32) }, { ...data, source: 'private' }, { ...data, marker: 'executed' },
      ...[NaN, Infinity, -1, 86400001, '150'].map(atMs => ({ ...data, atMs })), null, [], { marker: 'start' }].map(data => ({ ...event, data }))]) {
    assert.equal(readStallMarker(invalid, frame, nonce), null)
  }
  assert.equal(readStallMarker(event, null, nonce), null)
  assert.equal(readStallMarker(event, frame, 'invalid'), null)
  assert.throws(() => boundedStallSource('invalid'), /Invalid/)
})
