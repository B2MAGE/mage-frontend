const PREFIX = '/__isolated-security/'
const NONCE = /^[a-f0-9]{32}$/
const KINDS = new Set(['fetch', 'xhr', 'beacon', 'image', 'socket', 'self-navigation', 'parent-navigation', 'popup', 'form', 'import-script'])
const MAX_SESSIONS = 32, MAX_AGE_MS = 300000

/** Local test canary only. It records counts, never headers, request bodies, or account data. */
export function createIsolatedSecurityMiddleware({ now = () => Date.now() } = {}) {
  const sessions = new Map()
  return (request, response, next) => {
    if (!request.url?.startsWith(PREFIX)) return next()
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'")
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const finish = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)) }
    const host = request.headers.host
    if (!['127.0.0.1:5178', 'localhost:5178'].includes(host)) return finish(421, { error: 'Local test host required.' })
    if (Buffer.byteLength(request.url) > 2048 || request.url.includes('#') || request.url.includes('\\')) return finish(400, { error: 'Invalid test URL.' })
    let url
    try { url = new URL(request.url, `http://${host}`) } catch { return finish(400, { error: 'Invalid test URL.' }) }
    if (url.origin !== `http://${host}` || url.pathname !== request.url.split('?')[0]) return finish(400, { error: 'Invalid test path.' })
    const nonce = url.searchParams.get('nonce') ?? ''
    if (!NONCE.test(nonce)) return finish(400, { error: 'Invalid test identifier.' })
    if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
      request.resume?.()
      return finish(413, { error: 'Test routes do not accept a request body.' })
    }
    const current = now()
    for (const [key, session] of sessions) if (current - session.createdAt >= MAX_AGE_MS) sessions.delete(key)
    const queryKeys = [...url.searchParams.keys()]
    if (new Set(queryKeys).size !== queryKeys.length) return finish(400, { error: 'Duplicate fields are not allowed.' })
    const origin = request.headers.origin
    if (origin !== undefined && origin !== 'null' && origin !== `http://${host}`) return finish(403, { error: 'Unexpected probe origin.' })
    const parentRequest = () => (origin === undefined || origin === `http://${host}`)
      && (request.headers['sec-fetch-site'] === undefined || request.headers['sec-fetch-site'] === 'same-origin')
      && request.headers.authorization === undefined && request.headers.cookie === undefined
    if (url.pathname === `${PREFIX}register`) {
      if (request.method !== 'POST' || queryKeys.length !== 1 || origin !== `http://${host}` || !parentRequest()) return finish(403, { error: 'Credential-free parent registration required.' })
      if (sessions.has(nonce)) return finish(409, { error: 'Test identifier already exists.' })
      if (sessions.size >= MAX_SESSIONS) return finish(429, { error: 'Too many tests.' })
      sessions.set(nonce, { createdAt: current, requests: 0, kinds: Object.fromEntries([...KINDS].map(kind => [kind, 0])) })
      return finish(200, { registered: true })
    }
    const session = sessions.get(nonce)
    if (!session) return finish(404, { error: 'Test identifier is missing or expired.' })
    if (url.pathname === `${PREFIX}results`) {
      if (request.method !== 'GET' || queryKeys.length !== 1) return finish(400, { error: 'Invalid results request.' })
      if (!parentRequest()) return finish(403, { error: 'Credential-free parent results request required.' })
      return finish(200, { requests: session.requests, kinds: session.kinds })
    }
    if (url.pathname === `${PREFIX}canary`) {
      const kind = url.searchParams.get('kind')
      if (!['GET', 'POST'].includes(request.method) || queryKeys.length !== 2 || !KINDS.has(kind)) return finish(400, { error: 'Invalid canary request.' })
      // Saturating counters keep even a failed isolation test bounded in memory.
      session.requests = Math.min(1000, session.requests + 1)
      session.kinds[kind] = Math.min(1000, session.kinds[kind] + 1)
      // Count attempted credentialed calls without inspecting or retaining their values.
      if (request.headers.authorization !== undefined || request.headers.cookie !== undefined) return finish(403, { error: 'Credentials are not accepted.' })
      return finish(200, { received: true })
    }
    return finish(404, { error: 'Unknown test route.' })
  }
}

export function isolatedSecurityCanaryPlugin() {
  return { name: 'isolated-security-local-canary', configureServer(server) {
    const handler = createIsolatedSecurityMiddleware()
    server.middlewares.use(handler)
    // Upgrade requests bypass HTTP middleware; count them too before rejecting.
    server.httpServer?.on('upgrade', (request, socket) => {
      if (!request.url?.startsWith(PREFIX)) return
      handler(request, { setHeader() {}, writeHead() {}, end() {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      } }, () => socket.destroy())
    })
  } }
}
