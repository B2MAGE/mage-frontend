import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createHttpServer, request } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer, resolveConfig } from 'vite'
import { MANUAL_CHECK_PAGES, retiredTestRoutes, localManualCheckGuard, localManualChecksPlugin } from './manual-check-routes.mjs'

function call(handler, url, options = {}) {
  const result = { status: 0, headers: {}, body: '', next: false }
  handler({ url, method: 'GET', headers: { host: '127.0.0.1:5178' }, socket: { remoteAddress: '127.0.0.1' }, ...options }, {
    statusCode: 0,
    setHeader(name, value) { result.headers[name] = value },
    end(body) { result.status = this.statusCode; result.body = body },
  }, () => { result.next = true })
  return result
}

test('normal development retires all manual checks, canaries and their source aliases', () => {
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/')
  for (const path of [
    ...MANUAL_CHECK_PAGES.map(page => `/scripts/${page}`),
    '/scripts/isolated-worker-check.ts?import', '/player-check', '/player-check/security/',
    '/__isolated-security/register?nonce=abc', '/.local/build-manifest.json',
    '/%73cripts/isolated-worker-check.html', '/foo/../scripts/quality-scene-capture.html',
    `/@fs/${sourceRoot}scripts/isolated-playback-check.html`,
    `/@fs/${sourceRoot}.local/evidence.json`,
  ]) {
    const result = call(retiredTestRoutes, path)
    assert.equal(result.status, 410, path)
    assert.equal(result.next, false, path)
    assert.equal(result.headers['Cache-Control'], 'no-store')
    assert(!result.body.includes('<script'))
  }
  assert.equal(call(retiredTestRoutes, '/scripts/a.html', { method: 'HEAD' }).body, '')
  for (const path of ['/', '/create-scene', '/src/main.tsx', '/api/scenes/1', '/assets/index.js']) {
    assert.equal(call(retiredTestRoutes, path).next, true, path)
  }
})

test('the explicit harness refuses remote callers, deployment and public check URLs', () => {
  assert.equal(call(localManualCheckGuard, '/scripts/isolated-worker-check.html').next, true)
  for (const options of [{ socket: { remoteAddress: '192.168.1.2' } }, { headers: { host: 'mage.peterbucci.com' } }, { socket: {} }]) {
    assert.equal(call(localManualCheckGuard, '/scripts/isolated-worker-check.html', options).status, 403)
  }
  assert.equal(call(localManualCheckGuard, '/player-check/security/').status, 410)
  const plugin = localManualChecksPlugin()
  const valid = { command: 'serve', server: { host: '127.0.0.1', port: 5178, strictPort: true } }
  assert.doesNotThrow(() => plugin.configResolved(valid))
  for (const config of [{ ...valid, command: 'build' }, { ...valid, isPreview: true },
    { ...valid, server: { ...valid.server, host: '0.0.0.0' } },
    { ...valid, server: { ...valid.server, port: 5180 } },
    { ...valid, server: { ...valid.server, strictPort: false } }]) {
    assert.throws(() => plugin.configResolved(config), /dedicated development server/)
  }
})

async function fixture(t, configFile) {
  const vite = await createViteServer({ configFile, logLevel: 'silent', server: { middlewareMode: true } })
  const server = createHttpServer(vite.middlewares)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); server.close(); await vite.close() })
  return (path, options = {}) => new Promise((resolve, reject) => {
    const client = request({ hostname: '127.0.0.1', port: server.address().port, path,
      ...options, headers: { host: '127.0.0.1:5178', ...options.headers } }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk.toString() })
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }))
    })
    client.on('error', reject)
    client.end()
  })
}

test('normal Vite still serves app routes while retired paths cannot become SPA pages', async t => {
  const send = await fixture(t, fileURLToPath(new URL('../vite.config.ts', import.meta.url)))
  for (const path of ['/', '/create-scene']) {
    const result = await send(path)
    assert.equal(result.status, 200)
    assert.match(result.body, /id="root"/)
    assert.match(result.headers['content-security-policy'], /frame-src http:\/\/localhost:5181\/index.html/)
  }
  for (const page of MANUAL_CHECK_PAGES) assert.equal((await send(`/scripts/${page}`)).status, 410, page)
  assert.equal((await send('/__isolated-security/register?nonce=abc', { method: 'POST' })).status, 410)
  assert.equal((await send('/player-check/security/')).status, 410)
})

test('manual harness serves preserved fixtures and only enables the local canary explicitly', async t => {
  const configFile = fileURLToPath(new URL('./manual-checks.vite.config.mjs', import.meta.url))
  const resolved = await resolveConfig({ configFile, logLevel: 'silent' }, 'serve')
  assert.equal(resolved.server.host, '127.0.0.1')
  assert.equal(resolved.server.strictPort, true)
  const send = await fixture(t, configFile)
  for (const page of MANUAL_CHECK_PAGES) {
    const result = await send(`/scripts/${page}`)
    assert.equal(result.status, 200, page)
    assert.match(result.headers['content-security-policy'], /object-src 'none'/)
    assert.equal(result.headers['cache-control'], 'no-store')
  }
  assert.equal((await send('/scripts/isolated-worker-check.ts')).status, 200)
  const registration = await send(`/__isolated-security/register?nonce=${'a'.repeat(32)}`, {
    method: 'POST', headers: { origin: 'http://127.0.0.1:5178' },
  })
  assert.equal(registration.status, 200)
  assert.deepEqual(JSON.parse(registration.body), { registered: true })
  assert.equal((await send('/player-check/')).status, 410)
  assert.equal((await send('/scripts/isolated-worker-check.html', { headers: { host: 'example.com' } })).status, 403)
})
