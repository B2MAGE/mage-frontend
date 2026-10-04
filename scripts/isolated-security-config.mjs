export const SECURITY_CHECK_PARENT_ORIGIN = 'https://mage.peterbucci.com'
export const SECURITY_CHECK_RENDERER_URL = 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'
export const SECURITY_CHECK_PATH = '/player-check/security/'
export const SECURITY_CHECK_CANARY_PREFIX = '/player-check/__isolated-security/'

const configs = Object.freeze({
  local: Object.freeze({ parentOrigin: 'http://127.0.0.1:5178', rendererUrl: 'http://localhost:5181/index.html',
    path: '/scripts/isolated-security-check.html', canaryPrefix: '/__isolated-security/' }),
  deployed: Object.freeze({ parentOrigin: SECURITY_CHECK_PARENT_ORIGIN, rendererUrl: SECURITY_CHECK_RENDERER_URL,
    path: SECURITY_CHECK_PATH, canaryPrefix: SECURITY_CHECK_CANARY_PREFIX }),
})

export function fixedSecurityCheckConfig(mode) {
  if (!Object.hasOwn(configs, mode)) throw new Error('Unknown fixed security fixture.')
  return configs[mode]
}

export function isSecurityCheckLocation(mode, href, development) {
  const config = fixedSecurityCheckConfig(mode)
  try {
    const url = new URL(href)
    return (mode !== 'local' || development === true) && url.origin === config.parentOrigin && url.pathname === config.path &&
      !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

export function securityCanaryUrl(mode, nonce, kind, socket = false) {
  if (!/^[a-f0-9]{32}$/.test(nonce) || !['fetch', 'xhr', 'beacon', 'image', 'socket', 'self-navigation', 'parent-navigation', 'popup', 'form'].includes(kind)) {
    throw new Error('Invalid fixed canary probe.')
  }
  const config = fixedSecurityCheckConfig(mode)
  const url = new URL(`${config.canaryPrefix}canary`, config.parentOrigin)
  url.searchParams.set('nonce', nonce); url.searchParams.set('kind', kind)
  if (socket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
