import { posix } from 'node:path'

const GONE = 'This test page has been retired.\n'
const ERROR_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'"

export const MANUAL_CHECK_PAGES = Object.freeze([
  'audio-response-browser-check.html', 'audio-response-player-check.html',
  'isolated-playback-check.html', 'isolated-renderer-check.html',
  'isolated-security-check.html', 'isolated-worker-check.html',
  'quality-scene-capture.html', 'render-budget-check.html',
  'scene-availability-browser-check.html', 'scene-focus-browser-check.html',
])

function pathnameOf(requestUrl) {
  let path = (requestUrl ?? '').split('?')[0]
  try {
    // Vite accepts encoded file URLs as well as normal browser paths.
    for (let index = 0; index < 3; index++) {
      const decoded = decodeURIComponent(path)
      if (decoded === path) break
      path = decoded
    }
  } catch { return null }
  return posix.normalize(path.replaceAll('\\', '/')).toLowerCase()
}

function finish(request, response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.setHeader('Content-Security-Policy', ERROR_CSP)
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Robots-Tag', 'noindex, nofollow')
  response.end(request.method === 'HEAD' ? '' : body)
}

export function isRetiredTestPath(requestUrl) {
  const path = pathnameOf(requestUrl)
  if (path === null) return true
  return /^\/(?:player-check|__isolated-security|scripts|\.local)(?:\/|$)/.test(path)
    || (path.startsWith('/@fs/') && /\/(?:scripts|\.local)(?:\/|$)/.test(path))
}

export function retiredTestRoutes(request, response, next) {
  if (!isRetiredTestPath(request.url)) return next()
  finish(request, response, 410, GONE)
}

export function retiredTestSurfacesPlugin() {
  return {
    name: 'retired-test-surfaces',
    configureServer(server) { server.middlewares.use(retiredTestRoutes) },
    configurePreviewServer(server) { server.middlewares.use(retiredTestRoutes) },
  }
}

export function localManualCheckGuard(request, response, next) {
  const address = request.socket?.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
    || !['127.0.0.1:5178', 'localhost:5178'].includes(request.headers.host)) {
    return finish(request, response, 403, 'Manual checks are available on this computer only.\n')
  }
  const path = pathnameOf(request.url)
  // This separate harness never revives the old public release-check routes.
  if (path === null || /^\/player-check(?:\/|$)/.test(path)) return finish(request, response, 410, GONE)
  next()
}

export function localManualChecksPlugin() {
  return {
    name: 'loopback-only-manual-checks',
    configResolved(config) {
      if (config.command !== 'serve' || config.isPreview || config.server.host !== '127.0.0.1'
        || config.server.port !== 5178 || config.server.strictPort !== true) {
        throw new Error('Manual checks require the dedicated development server on 127.0.0.1:5178.')
      }
    },
    configureServer(server) {
      server.middlewares.use(localManualCheckGuard)
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]
        if (!MANUAL_CHECK_PAGES.some(page => path === `/scripts/${page}`)) return next()
        const secure = Boolean(server.config.server.https)
        const scheme = secure ? 'https' : 'http'
        const socketScheme = secure ? 'wss' : 'ws'
        const rendererUrl = request.headers.host === 'localhost:5178'
          ? `${scheme}://127.0.0.1:5181/index.html` : `${scheme}://localhost:5181/index.html`
        const frameSource = path === '/scripts/isolated-worker-check.html'
          ? `${scheme}://localhost:5182/index.html` : rendererUrl
        response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: ${socketScheme}://127.0.0.1:5178 ${socketScheme}://localhost:5178; img-src 'self' blob: data:; media-src blob:; frame-src ${frameSource}; object-src 'none'; base-uri 'none'; form-action 'none'`)
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('X-Robots-Tag', 'noindex, nofollow')
        next()
      })
    },
  }
}
