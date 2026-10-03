import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createIsolatedSecurityMiddleware, isolatedSecurityCanaryPlugin } from './isolated-security-server.mjs'
const nonce = 'a'.repeat(32)
function fixture() {
  let time = 0
  const handler = createIsolatedSecurityMiddleware({ now: () => time })
  function call(path, options = {}) {
    const result = { headers: {}, status: 0, body: null, next: false }
    handler({ url: path, method: 'GET', headers: { host: '127.0.0.1:5178', origin: 'http://127.0.0.1:5178', ...options.headers },
      ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'headers')), resume() {} },
    { setHeader(name, value) { result.headers[name] = value }, writeHead(status) { result.status = status }, end(body) { result.body = JSON.parse(body) } }, () => { result.next = true })
    return result
  }
  const register = (id = nonce) => call(`/__isolated-security/register?nonce=${id}`, { method: 'POST' })
  return { call, register, advance: ms => { time += ms } }
}
test('canary records only bounded counts for registered local tests', () => {
  const f = fixture()
  assert.equal(f.call('/').next, true)
  assert.equal(f.register().status, 200)
  for (let i = 0; i < 1100; i++) assert.equal(f.call(`/__isolated-security/canary?nonce=${nonce}&kind=fetch`).status, 200)
  const results = f.call(`/__isolated-security/results?nonce=${nonce}`)
  assert.equal(results.body.requests, 1000)
  assert.equal(results.body.kinds.fetch, 1000)
  assert.deepEqual(Object.keys(results.body).sort(), ['kinds', 'requests'])
  assert.equal(results.headers['Cache-Control'], 'no-store')
  assert.match(results.headers['Content-Security-Policy'], /default-src 'none'/)
})
test('canary rejects remote hosts, forged registrations, bodies, duplicate and unknown fields', () => {
  const f = fixture(), path = `/__isolated-security/register?nonce=${nonce}`
  assert.equal(f.call(path, { method: 'POST', headers: { host: 'example.com' } }).status, 421)
  assert.equal(f.call(path, { method: 'POST', headers: { origin: 'null' } }).status, 403)
  assert.equal(f.call(path, { method: 'POST', headers: { 'content-length': '1' } }).status, 413)
  assert.equal(f.call(path, { method: 'POST', headers: { 'transfer-encoding': 'chunked' } }).status, 413)
  assert.equal(f.call(`${path}&nonce=${nonce}`, { method: 'POST' }).status, 400)
  assert.equal(f.call(`${path}&extra=1`, { method: 'POST' }).status, 403)
  assert.equal(f.register().status, 200)
  assert.equal(f.register().status, 409)
  assert.equal(f.call(`/__isolated-security/canary?nonce=${nonce}&kind=secret`).status, 400)
  assert.equal(f.call('/__isolated-security/results?nonce=broken').status, 400)
})
test('sessions expire and session count is capped', () => {
  const f = fixture()
  for (let i = 0; i < 32; i++) assert.equal(f.register(i.toString(16).padStart(32, '0')).status, 200)
  assert.equal(f.register(nonce).status, 429)
  f.advance(300000)
  assert.equal(f.register(nonce).status, 200)
  assert.equal(f.call(`/__isolated-security/results?nonce=${'0'.repeat(32)}`).status, 404)
})
test('WebSocket upgrades are counted and rejected instead of bypassing HTTP middleware', () => {
  let handler, upgrade, answer
  isolatedSecurityCanaryPlugin().configureServer({ middlewares: { use(value) { handler = value } }, httpServer: { on(event, callback) { assert.equal(event, 'upgrade'); upgrade = callback } } })
  const headers = { host: '127.0.0.1:5178', origin: 'http://127.0.0.1:5178' }
  const response = { setHeader() {}, writeHead() {}, end(body) { answer = JSON.parse(body) } }
  handler({ url: `/__isolated-security/register?nonce=${nonce}`, method: 'POST', headers }, response, () => {})
  let closed = false
  upgrade({ url: `/__isolated-security/canary?nonce=${nonce}&kind=socket`, method: 'GET', headers }, { end(message) { assert.match(message, /403 Forbidden/); closed = true } })
  assert.equal(closed, true)
  handler({ url: `/__isolated-security/results?nonce=${nonce}`, method: 'GET', headers }, response, () => {})
  assert.equal(answer.kinds.socket, 1)
})
