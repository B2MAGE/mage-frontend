import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RETIRED = 'The MAGE release test pages have been retired.\n'
const CSP = "default-src 'none'; sandbox; frame-ancestors 'none'"

/** Tombstone for the existing proxy route. Never loads test bundles or canaries. */
export function createPlayerCheckHandler() {
  return (request, response) => {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.setHeader('Content-Security-Policy', CSP)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    response.setHeader('Connection', 'close')
    const rawPath = request.url?.split('?')[0] ?? ''
    let path
    try { path = decodeURIComponent(rawPath) } catch { path = '' }
    const retired = /^\/player-check(?:\/|$)/.test(path)
    const healthy = rawPath === '/healthz' && ['GET', 'HEAD'].includes(request.method)
    response.statusCode = retired ? 410 : healthy ? 200 : 404
    const body = retired ? RETIRED : healthy ? 'ok\n' : 'Not found.\n'
    response.setHeader('Content-Length', Buffer.byteLength(body))
    response.end(request.method === 'HEAD' ? '' : body)
  }
}

export function createPlayerCheckServer() {
  const handler = createPlayerCheckHandler()
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 1000 }, handler)
  server.maxConnections = 32
  server.maxRequestsPerSocket = 1
  server.setTimeout(5000, socket => socket.destroy())
  server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 410 Gone\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'))
  server.on('checkContinue', handler)
  server.on('checkExpectation', handler)
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'))
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 80)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid retirement service port.')
  const server = createPlayerCheckServer()
  server.listen(port, '0.0.0.0')
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
}
