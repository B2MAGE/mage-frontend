const config = Object.freeze({
  parentOrigin: 'http://127.0.0.1:5178', rendererUrl: 'http://localhost:5181/index.html',
  path: '/scripts/isolated-security-check.html', canaryPrefix: '/__isolated-security/',
})

export function fixedSecurityCheckConfig() { return config }

export function isSecurityCheckLocation(href, development) {
  try {
    const url = new URL(href)
    return development === true && url.origin === config.parentOrigin && url.pathname === config.path &&
      !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}

export function securityCanaryUrl(nonce, kind, socket = false) {
  if (!/^[a-f0-9]{32}$/.test(nonce) || !['fetch', 'xhr', 'beacon', 'image', 'socket', 'self-navigation', 'parent-navigation', 'popup', 'form'].includes(kind)) {
    throw new Error('Invalid fixed canary probe.')
  }
  const url = new URL(`${config.canaryPrefix}canary`, config.parentOrigin)
  url.searchParams.set('nonce', nonce); url.searchParams.set('kind', kind)
  if (socket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}
