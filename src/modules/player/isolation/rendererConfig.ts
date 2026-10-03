import { validateRendererUrl } from './rendererHost'

export const PRODUCTION_RENDERER_URL = 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'

/** Fixed deployment addresses also appear in the parent CSP and child allowlist. */
export function getIsolatedRendererUrl(appHref = window.location.href): string {
  const app = new URL(appHref)
  if (import.meta.env.DEV && app.protocol === 'http:' && app.port === '5178') {
    if (app.hostname === '127.0.0.1') return validateRendererUrl('http://localhost:5181/index.html', appHref).href
    if (app.hostname === 'localhost') return validateRendererUrl('http://127.0.0.1:5181/index.html', appHref).href
  }
  if (app.origin !== 'https://mage.peterbucci.com') {
    throw new Error('An isolated player is not configured for this site.')
  }
  return validateRendererUrl(PRODUCTION_RENDERER_URL, appHref).href
}
