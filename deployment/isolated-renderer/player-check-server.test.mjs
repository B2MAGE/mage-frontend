import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { request } from 'node:http'
import { connect } from 'node:net'
import { once } from 'node:events'
import { createPlayerCheckHandler, createPlayerCheckServer } from './player-check-server.mjs'

function call(url, method = 'GET') {
  const result = { status: 0, body: '', headers: {} }
  createPlayerCheckHandler()({ url, method, headers: {} }, {
    statusCode: 0,
    setHeader(name, value) { result.headers[name] = value },
    end(body) { result.status = this.statusCode; result.body = body },
  })
  return result
}

test('every old public page, asset and canary returns Gone for all methods', () => {
  for (const path of ['/player-check', '/player-check/', '/player-check/security/', '/player-check/worker/',
    '/player-check/assets/check-old.js', '/player-check/worker/assets/worker-old.css',
    '/player-check/__isolated-security/register?nonce=abc', '/player-check/__isolated-security/canary?nonce=abc',
    '/player-check/__isolated-security/results?nonce=abc', '/player-check/%2e%2e/anything']) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS']) {
      const result = call(path, method)
      assert.equal(result.status, 410, `${method} ${path}`)
      assert.equal(result.headers['Cache-Control'], 'no-store')
      assert.equal(result.headers['Content-Security-Policy'], "default-src 'none'; sandbox; frame-ancestors 'none'")
      assert.equal(result.headers['X-Robots-Tag'], 'noindex, nofollow')
      assert.equal(result.headers['Content-Type'], 'text/plain; charset=utf-8')
      assert(!result.body.includes('<script'))
      if (method === 'HEAD') assert.equal(result.body, '')
    }
  }
})

test('health is separate from retired URLs and unrelated paths do not become app routes', () => {
  assert.equal(call('/healthz').status, 200)
  assert.equal(call('/healthz').body, 'ok\n')
  assert.equal(call('/healthz', 'HEAD').body, '')
  assert.equal(call('/healthz', 'POST').status, 404)
  for (const path of ['/', '/index.html', '/api/auth/me', '/player-check-other', '/%zz']) {
    assert.equal(call(path).status, 404, path)
  }
})

async function rawRequest(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let result = ''
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Retirement request timed out.')) })
    socket.on('connect', () => socket.write(payload))
    socket.on('data', data => { result += data.toString() })
    socket.on('error', reject)
    socket.on('close', () => resolve(result))
  })
}

test('running responder needs no test artifacts and rejects upgrades and pending bodies', async t => {
  const server = createPlayerCheckServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const port = server.address().port
  const send = path => new Promise((resolve, reject) => {
    const client = request({ hostname: '127.0.0.1', port, path }, response => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    })
    client.on('error', reject)
    client.end()
  })
  assert.equal(await send('/healthz'), 200)
  assert.equal(await send('/player-check/security/'), 410)
  const upgrade = await rawRequest(port, 'GET /player-check/__isolated-security/canary HTTP/1.1\r\nHost: mage.peterbucci.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
  assert.match(upgrade, /^HTTP\/1\.1 410/)
  const pendingBody = await rawRequest(port, 'POST /player-check/__isolated-security/register HTTP/1.1\r\nHost: mage.peterbucci.com\r\nExpect: 100-continue\r\nContent-Length: 100\r\n\r\n')
  assert.match(pendingBody, /^HTTP\/1\.1 410/)
  assert(!pendingBody.includes('100 Continue'))
  const streamed = await rawRequest(port, 'POST /player-check/__isolated-security/canary HTTP/1.1\r\nHost: mage.peterbucci.com\r\nTransfer-Encoding: chunked\r\n\r\n')
  assert.match(streamed, /^HTTP\/1\.1 410/)
})

test('deployments contain no verification assets and normal app keeps retired URLs out of SPA fallback', async () => {
  const docker = await readFile(new URL('./Dockerfile.player-check', import.meta.url), 'utf8')
  assert(!docker.includes('npm ci'))
  assert(!docker.includes('dist-player-check'))
  assert(!docker.includes('COPY src'))
  assert(docker.includes('http://127.0.0.1:80/healthz'))
  const nginx = await readFile(new URL('../../docker/nginx.conf', import.meta.url), 'utf8')
  assert(nginx.includes('location = /player-check { return 410; }'))
  assert(nginx.includes('location ^~ /player-check/ { return 410; }'))
  assert(nginx.includes('try_files $uri $uri/ /index.html;'))
})
