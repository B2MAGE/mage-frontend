import { createHash } from 'node:crypto'

export const LOCAL_PARENT_ORIGINS = ['http://127.0.0.1:5178', 'http://localhost:5178']
export const RENDERER_STYLE = 'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#08090b;color:#f3f4f6;font:14px system-ui,sans-serif}canvas{display:block;width:100%;height:100%}#renderer-status{position:absolute;inset:auto 16px 16px;margin:0;pointer-events:none}#renderer-status:empty{display:none}'
export const PERMISSIONS_POLICY = 'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=()'

export function integrityOf(source) {
  return `sha384-${createHash('sha384').update(source).digest('base64')}`
}

export function assertNonCredentialedResponse(headers) {
  if (headers.get('set-cookie') !== null) throw new Error('Renderer must not set cookies.')
  const credentials = headers.get('access-control-allow-credentials')
  if (credentials !== null && credentials !== 'false') throw new Error('Renderer must not allow credentials.')
}

export function parseParentOrigins(value, production = false) {
  const origins = value === undefined ? (production ? [] : LOCAL_PARENT_ORIGINS) : value.split(',').map((origin) => origin.trim())
  if (!origins.length || origins.length > 8) throw new Error('Specify one to eight exact renderer parent origins.')
  for (const origin of origins) {
    let url
    try { url = new URL(origin) } catch { throw new Error(`Invalid renderer parent origin: ${origin}`) }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if (url.origin !== origin || url.username || url.password || (!/^[a-z0-9.-]+$/.test(url.hostname) && url.hostname !== '[::1]') || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !production)) || (production && local)) {
      throw new Error('Renderer parents must be exact HTTPS origins; loopback HTTP is allowed only in a local build.')
    }
  }
  return [...new Set(origins)]
}

export function createHostingManifest({ bundlePath, bundle, parentOrigins, production = false }) {
  if (!/^assets\/renderer-[A-Za-z0-9_-]+\.js$/.test(bundlePath)) throw new Error('Unexpected renderer asset path.')
  if (typeof production !== 'boolean' || !Array.isArray(parentOrigins) || !parentOrigins.every((origin) => typeof origin === 'string')) throw new Error('Invalid renderer parent configuration.')
  parseParentOrigins(parentOrigins.join(','), production)
  const scriptIntegrity = integrityOf(bundle)
  const styleIntegrity = integrityOf(RENDERER_STYLE)
  const contentSecurityPolicy = [
    "default-src 'none'",
    "sandbox allow-scripts",
    `script-src '${scriptIntegrity}' 'unsafe-eval'`,
    "script-src-attr 'none'",
    `style-src '${styleIntegrity}'`,
    "style-src-attr 'none'",
    'img-src data: blob:',
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "media-src 'none'",
    "font-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${parentOrigins.join(' ')}`,
  ].join('; ')
  if (contentSecurityPolicy.length > 1783) throw new Error('Renderer CSP exceeds the CloudFront response policy limit.')
  return {
    version: 1,
    production,
    parentOrigins,
    bundlePath,
    scriptIntegrity,
    styleIntegrity,
    headers: {
      'Content-Security-Policy': contentSecurityPolicy,
      'Permissions-Policy': PERMISSIONS_POLICY,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      // The sandbox has an opaque origin. SRI requires anonymous CORS for this public bundle.
      'Access-Control-Allow-Origin': '*',
    },
    files: {
      '/': { file: 'index.html', contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' },
      '/index.html': { file: 'index.html', contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' },
      [`/${bundlePath}`]: { file: bundlePath, contentType: 'text/javascript; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' },
    },
  }
}

export function renderDocument(manifest) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MAGE isolated renderer</title><style>${RENDERER_STYLE}</style></head><body><canvas id="renderer-canvas"></canvas><p id="renderer-status" role="status">Waiting for MAGE…</p><script src="/${manifest.bundlePath}" integrity="${manifest.scriptIntegrity}" crossorigin="anonymous"></script></body></html>\n`
}
