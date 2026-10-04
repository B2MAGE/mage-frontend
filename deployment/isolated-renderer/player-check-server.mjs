import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { LIVE_CHECK_PARENT_ORIGIN, LIVE_CHECK_RENDERER_URL, LIVE_CHECK_CSP } from './live-check-page.mjs'
import { SECURITY_CHECK_CSP, SECURITY_CHECK_CANARY_PREFIX } from './security-check-page.mjs'
import { WORKER_CHECK_CSP } from './worker-check-page.mjs'

const BASE = '/player-check/'
const HOST = new URL(LIVE_CHECK_PARENT_ORIGIN).host
const ERROR_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'"
const MAX_URL_BYTES = 2048
const MAX_SESSIONS = 32
const SESSION_MS = 300000
const NONCE = /^[a-f0-9]{32}$/
const KINDS = ['fetch', 'xhr', 'beacon', 'image', 'socket', 'self-navigation', 'parent-navigation', 'popup', 'form']
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
const integrityOf = body => `sha384-${createHash('sha384').update(body).digest('base64')}`
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

/** Load verified fixed artifacts into memory. Request paths never reach the filesystem. */
export async function loadPlayerCheckBuild(directory) {
  const boundedFile = async (path, limit) => {
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > limit) throw new Error('Verification artifact is too large or is not a file.')
    const body = await readFile(path)
    if (body.length > limit) throw new Error('Verification artifact is too large.')
    return body
  }
  const files = new Map()
  for (const [subdirectory, prefix, csp] of [
    ['', 'check', LIVE_CHECK_CSP], ['security', 'security', SECURITY_CHECK_CSP], ['worker', 'worker', WORKER_CHECK_CSP],
  ]) {
    const root = resolve(directory, subdirectory)
    const manifestBytes = await boundedFile(resolve(root, 'build-manifest.json'), 16384)
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    if (!exactKeys(manifest, ['version', 'parentOrigin', 'rendererUrl', 'files']) || manifest.version !== 1
      || manifest.parentOrigin !== LIVE_CHECK_PARENT_ORIGIN || manifest.rendererUrl !== LIVE_CHECK_RENDERER_URL
      || !exactKeys(manifest.files, Object.keys(manifest.files ?? {})) || Object.keys(manifest.files).length !== 3) {
      throw new Error('Invalid verification artifact manifest.')
    }
    const entries = Object.entries(manifest.files)
    const assetPath = extension => entries.find(([path]) => new RegExp(`^assets/${prefix}-[A-Za-z0-9_-]+\\.${extension}$`).test(path))?.[0]
    const script = assetPath('js'), style = assetPath('css')
    if (!script || !style || !Object.hasOwn(manifest.files, 'index.html')) throw new Error('Unexpected verification files.')
    const bodyByPath = new Map()
    for (const [path, description] of entries) {
      if (!['index.html', script, style].includes(path) || !exactKeys(description, ['integrity', 'contentType'])
        || !/^sha384-[A-Za-z0-9+/]{64}$/.test(description.integrity)) throw new Error('Invalid verification file metadata.')
      const extension = path.slice(path.lastIndexOf('.'))
      if (description.contentType !== TYPES[extension]) throw new Error('Unexpected verification content type.')
      const body = await boundedFile(resolve(root, path), 2097152)
      if (integrityOf(body) !== description.integrity) throw new Error('Verification artifact integrity mismatch.')
      bodyByPath.set(path, body)
      const requestPath = `${BASE}${subdirectory ? `${subdirectory}/` : ''}${path}`
      files.set(requestPath, { body, contentType: description.contentType, csp: `${csp}; frame-ancestors 'none'` })
    }
    const html = bodyByPath.get('index.html').toString('utf8')
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    const styles = [...html.matchAll(/<link\b([^>]*)>/gi)].filter(match => /rel="stylesheet"/.test(match[1]))
    const expectedAsset = (attributes, attribute, path) => attributes.includes(`${attribute}="./${path}"`)
      && attributes.includes(`integrity="${manifest.files[path].integrity}"`)
    if (scripts.length !== 1 || scripts[0][2].trim() !== '' || !expectedAsset(scripts[0][1], 'src', script)
      || styles.length !== 1 || !expectedAsset(styles[0][1], 'href', style)) throw new Error('Verification document must use the approved SRI assets.')
    files.set(`${BASE}${subdirectory ? `${subdirectory}/` : ''}`, files.get(`${BASE}${subdirectory ? `${subdirectory}/` : ''}index.html`))
  }
  return files
}

function headers(response, contentType = 'application/json; charset=utf-8', csp = ERROR_CSP) {
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Robots-Tag', 'noindex, nofollow')
}

/** Public fixed-probe service: only bounded counts; no account calls, source input, logs or persistence. */
export function createPlayerCheckHandler(files, { now = () => Date.now() } = {}) {
  const sessions = new Map()
  return (request, response) => {
    headers(response)
    const finish = (status, value) => {
      response.statusCode = status
      response.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    }
    const rejectBody = () => {
      response.setHeader('Connection', 'close')
      response.once?.('finish', () => request.destroy?.())
      finish(413, { error: 'Request bodies are not accepted.' })
    }
    const rawHeaders = request.rawHeaders ?? []
    const critical = new Set(['host', 'origin', 'content-length', 'transfer-encoding'])
    const seen = new Set()
    if (rawHeaders.length > 128) return finish(431, { error: 'Too many verification headers.' })
    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name = rawHeaders[index].toLowerCase()
      if (critical.has(name) && seen.has(name)) return finish(400, { error: 'Duplicate verification headers.' })
      seen.add(name)
    }
    if (request.headers.host !== HOST) return finish(421, { error: 'Unexpected verification host.' })
    if (typeof request.url !== 'string' || Buffer.byteLength(request.url) > MAX_URL_BYTES || !request.url.startsWith('/')
      || request.url.includes('#') || request.url.includes('\\')) return finish(400, { error: 'Invalid verification URL.' })
    if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) return rejectBody()
    let url
    try { url = new URL(request.url, LIVE_CHECK_PARENT_ORIGIN) } catch { return finish(400, { error: 'Invalid verification URL.' }) }
    if (url.origin !== LIVE_CHECK_PARENT_ORIGIN || url.pathname !== request.url.split('?')[0]) return finish(400, { error: 'Invalid verification path.' })
    if (!url.pathname.startsWith(SECURITY_CHECK_CANARY_PREFIX)) {
      if (!['GET', 'HEAD'].includes(request.method)) return finish(405, { error: 'Method not allowed.' })
      if (url.search) return finish(400, { error: 'Unexpected verification query.' })
      const redirects = { '/player-check': BASE, '/player-check/security': `${BASE}security/`, '/player-check/worker': `${BASE}worker/` }
      if (Object.hasOwn(redirects, url.pathname)) {
        response.setHeader('Location', redirects[url.pathname])
        return finish(308, '')
      }
      const file = files.get(url.pathname)
      if (!file) return finish(404, { error: 'Unknown verification file.' })
      headers(response, file.contentType, file.csp)
      response.setHeader('Content-Length', file.body.length)
      return finish(200, request.method === 'HEAD' ? '' : file.body)
    }

    const keys = [...url.searchParams.keys()]
    const nonce = url.searchParams.get('nonce') ?? ''
    if (!NONCE.test(nonce) || new Set(keys).size !== keys.length) return finish(400, { error: 'Invalid test identifier or fields.' })
    const origin = request.headers.origin
    if (origin !== undefined && origin !== 'null' && origin !== LIVE_CHECK_PARENT_ORIGIN) return finish(403, { error: 'Unexpected probe origin.' })
    for (const [id, session] of sessions) if (now() - session.createdAt >= SESSION_MS) sessions.delete(id)
    const parentRequest = () => (origin === undefined || origin === LIVE_CHECK_PARENT_ORIGIN)
      && (request.headers['sec-fetch-site'] === undefined || request.headers['sec-fetch-site'] === 'same-origin')
      && request.headers.authorization === undefined && request.headers.cookie === undefined
    if (url.pathname === `${SECURITY_CHECK_CANARY_PREFIX}register`) {
      if (request.method !== 'POST' || keys.length !== 1 || origin !== LIVE_CHECK_PARENT_ORIGIN || !parentRequest()) return finish(403, { error: 'Credential-free parent registration required.' })
      if (sessions.has(nonce)) return finish(409, { error: 'Test identifier already exists.' })
      if (sessions.size >= MAX_SESSIONS) return finish(429, { error: 'Too many active tests.' })
      sessions.set(nonce, { createdAt: now(), requests: 0, kinds: Object.fromEntries(KINDS.map(kind => [kind, 0])) })
      return finish(200, { registered: true })
    }
    if (url.pathname !== `${SECURITY_CHECK_CANARY_PREFIX}results` && url.pathname !== `${SECURITY_CHECK_CANARY_PREFIX}canary`) return finish(404, { error: 'Unknown verification route.' })
    const session = sessions.get(nonce)
    if (!session) return finish(404, { error: 'Test identifier is missing or expired.' })
    if (url.pathname === `${SECURITY_CHECK_CANARY_PREFIX}results`) {
      if (request.method !== 'GET' || keys.length !== 1 || !parentRequest()) return finish(403, { error: 'Credential-free parent results request required.' })
      return finish(200, { requests: session.requests, kinds: session.kinds })
    }
    const kind = url.searchParams.get('kind')
    if (!['GET', 'POST'].includes(request.method) || keys.length !== 2 || !KINDS.includes(kind)) return finish(400, { error: 'Invalid canary request.' })
    session.requests = Math.min(1000, session.requests + 1)
    session.kinds[kind] = Math.min(1000, session.kinds[kind] + 1)
    // Count an attempted credentialed request, but never inspect, expose or retain its credentials.
    if (request.headers.authorization !== undefined || request.headers.cookie !== undefined) return finish(403, { error: 'Credentials are not accepted.' })
    return finish(200, { received: true })
  }
}

export function createPlayerCheckServer(files, options) {
  const handler = createPlayerCheckHandler(files, options)
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 1000 }, handler)
  // Preserve all bounded headers so the handler can reject excess/duplicates,
  // rather than letting a truncation hide a Content-Length field.
  server.maxHeadersCount = 0
  server.maxConnections = 64
  server.maxRequestsPerSocket = 64
  server.on('dropRequest', (_request, socket) => socket.destroy())
  server.setTimeout(5000, socket => socket.destroy())
  server.on('upgrade', (request, socket) => {
    let url
    try { url = new URL(request.url, LIVE_CHECK_PARENT_ORIGIN) } catch { return socket.destroy() }
    if (request.method !== 'GET' || url.pathname !== `${SECURITY_CHECK_CANARY_PREFIX}canary`
      || url.searchParams.get('kind') !== 'socket') return socket.destroy()
    handler(request, { setHeader() {}, statusCode: 403, end() {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    } })
  })
  server.on('checkContinue', handler)
  server.on('checkExpectation', (_request, response) => {
    headers(response)
    response.writeHead(417, { Connection: 'close' })
    response.end(JSON.stringify({ error: 'Request expectations are not supported.' }))
  })
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'))
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.env.MAGE_PLAYER_CHECK_DIRECTORY ?? 'dist-player-check')
  const port = Number(process.env.PORT ?? 80)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid verification service port.')
  const server = createPlayerCheckServer(await loadPlayerCheckBuild(directory))
  server.listen(port, '0.0.0.0')
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
}
