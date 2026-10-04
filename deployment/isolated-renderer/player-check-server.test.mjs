import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from 'node:net'
import { request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { createPlayerCheckHandler, createPlayerCheckServer, loadPlayerCheckBuild } from './player-check-server.mjs'
import { LIVE_CHECK_PARENT_ORIGIN, LIVE_CHECK_RENDERER_URL, LIVE_CHECK_CSP } from './live-check-page.mjs'
import { SECURITY_CHECK_CSP, SECURITY_CHECK_CANARY_PREFIX as PREFIX } from './security-check-page.mjs'

const host = new URL(LIVE_CHECK_PARENT_ORIGIN).host
const nonce = '1'.repeat(32)
const integrityOf = body => `sha384-${createHash('sha384').update(body).digest('base64')}`
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporaryRoot = resolve(repository, '.local')
async function fixture(t) {
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(resolve(temporaryRoot, 'player-check-server-test-'))
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), temporaryRoot)
    assert(basename(directory).startsWith('player-check-server-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  for (const [folder, prefix] of [['', 'check'], ['security', 'security']]) {
    const root = resolve(directory, folder)
    await mkdir(resolve(root, 'assets'), { recursive: true })
    const scriptPath = `assets/${prefix}-abc123.js`, stylePath = `assets/${prefix}-def456.css`
    const script = 'window.fixture = true;', style = 'body{color:white}'
    const html = `<html><head><link rel="stylesheet" href="./${stylePath}" integrity="${integrityOf(style)}"></head><body><script src="./${scriptPath}" integrity="${integrityOf(script)}" defer></script></body></html>`
    const files = { 'index.html': { integrity: integrityOf(html), contentType: 'text/html; charset=utf-8' },
      [scriptPath]: { integrity: integrityOf(script), contentType: 'text/javascript; charset=utf-8' },
      [stylePath]: { integrity: integrityOf(style), contentType: 'text/css; charset=utf-8' } }
    await Promise.all([writeFile(resolve(root, scriptPath), script), writeFile(resolve(root, stylePath), style),
      writeFile(resolve(root, 'index.html'), html), writeFile(resolve(root, 'build-manifest.json'), JSON.stringify({ version: 1,
        parentOrigin: LIVE_CHECK_PARENT_ORIGIN, rendererUrl: LIVE_CHECK_RENDERER_URL, files }))])
  }
  return directory
}
function request(handler, url, { method = 'GET', headers = {}, rawHeaders } = {}) {
  const result = { status: 0, headers: {}, body: '', destroyed: false }
  handler({ url, method, headers: { host, ...headers }, rawHeaders, destroy() { result.destroyed = true } }, {
    statusCode: 0, setHeader(name, value) { result.headers[name.toLowerCase()] = value },
    end(body) { result.status = this.statusCode; result.body = Buffer.isBuffer(body) ? body.toString() : body },
  })
  return result
}
const register = (handler, id = nonce) => request(handler, `${PREFIX}register?nonce=${id}`, { method: 'POST', headers: { origin: LIVE_CHECK_PARENT_ORIGIN } })
const results = (handler, id = nonce) => JSON.parse(request(handler, `${PREFIX}results?nonce=${id}`).body)

test('loads exact manifest bytes and serves only fixed verified documents and SRI assets', async t => {
  const directory = await fixture(t), files = await loadPlayerCheckBuild(directory), handler = createPlayerCheckHandler(files)
  assert.equal(files.size, 8)
  for (const [path, csp] of [['/player-check/', LIVE_CHECK_CSP], ['/player-check/security/', SECURITY_CHECK_CSP]]) {
    const value = request(handler, path)
    assert.equal(value.status, 200)
    assert.equal(value.headers['content-security-policy'], `${csp}; frame-ancestors 'none'`)
    assert.equal(value.headers['cache-control'], 'no-store')
    assert.equal(value.headers['x-content-type-options'], 'nosniff')
    assert.equal(value.headers['referrer-policy'], 'no-referrer')
    assert.equal(request(handler, path, { method: 'HEAD' }).body, '')
    assert.equal(request(handler, path, { method: 'POST' }).status, 405)
  }
  assert.equal(request(handler, '/player-check').headers.location, '/player-check/')
  assert.equal(request(handler, '/player-check/security').headers.location, '/player-check/security/')
  for (const path of ['/', '/api/auth/me', '/player-check/build-manifest.json', '/player-check/security/build-manifest.json',
    '/player-check/assets/not-built.js', '/player-check/../index.html', '/player-check/%2e%2e/index.html', '/player-check/?token=x']) {
    assert(request(handler, path).status >= 400, path)
  }
  assert.equal(request(handler, '/player-check/', { headers: { host: 'attacker.invalid', 'x-forwarded-host': host } }).status, 421)
  assert.equal(request(handler, '/player-check/', { rawHeaders: ['Host', host, 'Host', host] }).status, 400)
  assert.equal(request(handler, '/player-check/', { rawHeaders: Array.from({ length: 130 }, () => 'x') }).status, 431)
})

test('fails startup for tampered bytes, wrong origins, unknown files, bad MIME and missing SRI', async t => {
  const directory = await fixture(t), path = resolve(directory, 'build-manifest.json')
  const original = JSON.parse(await readFile(path, 'utf8'))
  for (const mutate of [
    manifest => { manifest.parentOrigin = 'https://attacker.invalid' },
    manifest => { manifest.rendererUrl = `${LIVE_CHECK_RENDERER_URL}?ignored=true` },
    manifest => { manifest.files['../secret'] = manifest.files['index.html'] },
    manifest => { manifest.files['index.html'].contentType = 'text/plain' },
  ]) {
    const altered = structuredClone(original); mutate(altered)
    await writeFile(path, JSON.stringify(altered))
    await assert.rejects(loadPlayerCheckBuild(directory))
  }
  await writeFile(path, JSON.stringify(original))
  await writeFile(resolve(directory, 'assets/check-abc123.js'), 'tampered')
  await assert.rejects(loadPlayerCheckBuild(directory), /integrity/)
  await writeFile(resolve(directory, 'assets/check-abc123.js'), 'window.fixture = true;')
  const html = (await readFile(resolve(directory, 'index.html'), 'utf8')).replace(/integrity="[^"]+"/g, '')
  original.files['index.html'].integrity = integrityOf(html)
  await writeFile(resolve(directory, 'index.html'), html); await writeFile(path, JSON.stringify(original))
  await assert.rejects(loadPlayerCheckBuild(directory), /SRI/)
})

test('canary accepts only bounded credential-free registrations and exact requests', () => {
  const handler = createPlayerCheckHandler(new Map())
  assert.equal(register(handler).status, 200)
  assert.equal(register(handler).status, 409)
  assert.equal(request(handler, `${PREFIX}canary?nonce=${nonce}&kind=fetch`, { headers: { origin: 'null' } }).status, 200)
  assert.equal(results(handler).requests, 1)
  for (const url of [`${PREFIX}register?nonce=${nonce}&nonce=${nonce}`, `${PREFIX}results?nonce=${nonce}&extra=x`,
    `${PREFIX}canary?nonce=${nonce}&kind=unknown`, `${PREFIX}canary?nonce=x&kind=fetch`, `${PREFIX}unknown?nonce=${nonce}`]) {
    assert(request(handler, url).status >= 400, url)
  }
  for (const headers of [{ origin: 'https://attacker.invalid' }, { cookie: 'never-retained' }, { authorization: 'never-retained' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal(request(handler, `${PREFIX}results?nonce=${nonce}`, { headers }).status, 403)
  }
  assert.equal(request(handler, `${PREFIX}register?nonce=${'2'.repeat(32)}`, { method: 'POST' }).status, 403)
  assert.equal(request(handler, `${PREFIX}register?nonce=${'2'.repeat(32)}`, { method: 'POST', headers: { origin: 'null' } }).status, 403)
  assert.equal(request(handler, `${PREFIX}canary?nonce=${nonce}&kind=fetch`, { headers: { cookie: 'never-retained' } }).status, 403)
  const evidence = request(handler, `${PREFIX}results?nonce=${nonce}`)
  assert.equal(JSON.parse(evidence.body).requests, 2)
  assert(!evidence.body.includes('never-retained'))
  assert.equal(evidence.headers['access-control-allow-origin'], undefined)
  assert.equal(evidence.headers['set-cookie'], undefined)
  for (const headers of [{ 'content-length': '1' }, { 'transfer-encoding': 'chunked' }]) {
    assert.equal(request(handler, `${PREFIX}canary?nonce=${nonce}&kind=beacon`, { method: 'POST', headers }).status, 413)
  }
  assert.equal(request(handler, `/${'x'.repeat(2048)}`).status, 400)
})

test('sessions expire, registration is capped, and all probe counters saturate', () => {
  let now = 0
  const handler = createPlayerCheckHandler(new Map(), { now: () => now })
  for (let i = 0; i < 32; i++) assert.equal(register(handler, i.toString(16).padStart(32, '0')).status, 200)
  assert.equal(register(handler).status, 429)
  const id = '0'.repeat(32)
  for (let i = 0; i < 1100; i++) request(handler, `${PREFIX}canary?nonce=${id}&kind=image`)
  assert.equal(results(handler, id).requests, 1000)
  assert.equal(results(handler, id).kinds.image, 1000)
  now = 300000
  assert.equal(request(handler, `${PREFIX}results?nonce=${id}`).status, 404)
  assert.equal(register(handler).status, 200)
})

async function rawRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let result = ''
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Raw verification request timed out.')) })
    socket.on('connect', () => socket.write(payload))
    socket.on('data', data => { result += data.toString() })
    socket.on('error', reject)
    socket.on('close', () => resolve(result))
  })
}

test('real HTTP server counts WebSocket attempts then rejects and never accepts streamed or Expect bodies', async t => {
  const handlerFiles = new Map(), server = createPlayerCheckServer(handlerFiles)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const port = server.address().port
  const send = (path, options = {}) => new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path, ...options, headers: { host, ...options.headers } }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk.toString() })
      response.on('end', () => resolve({ status: response.statusCode, json: () => JSON.parse(body) }))
    })
    request.on('error', reject); request.end()
  })
  assert.equal((await send(`${PREFIX}register?nonce=${nonce}`, { method: 'POST', headers: { origin: LIVE_CHECK_PARENT_ORIGIN } })).status, 200)
  const upgrade = await rawRequest(port, `GET ${PREFIX}canary?nonce=${nonce}&kind=socket HTTP/1.1\r\nHost: ${host}\r\nOrigin: null\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`)
  assert.match(upgrade, /^HTTP\/1\.1 403/)
  assert.equal((await (await send(`${PREFIX}results?nonce=${nonce}`)).json()).kinds.socket, 1)
  const expected = await rawRequest(port, `POST ${PREFIX}register?nonce=${'3'.repeat(32)} HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${LIVE_CHECK_PARENT_ORIGIN}\r\nExpect: 100-continue\r\nContent-Length: 10\r\n\r\n`)
  assert.match(expected, /^HTTP\/1\.1 413/)
  assert(!expected.includes('100 Continue'))
  const streaming = await rawRequest(port, `POST ${PREFIX}canary?nonce=${nonce}&kind=beacon HTTP/1.1\r\nHost: ${host}\r\nTransfer-Encoding: chunked\r\n\r\n`)
  assert.match(streaming, /^HTTP\/1\.1 413/)
  const oversized = await rawRequest(port, `GET /player-check/ HTTP/1.1\r\nHost: ${host}\r\nX-Large: ${'a'.repeat(9000)}\r\n\r\n`)
  assert.match(oversized, /^HTTP\/1\.1 400/)
  assert.equal((await send('/api/auth/me')).status, 404)
  assert.equal(server.maxConnections, 64)
  assert.equal(server.maxRequestsPerSocket, 64)
  assert.equal(server.requestTimeout, 5000)
})
