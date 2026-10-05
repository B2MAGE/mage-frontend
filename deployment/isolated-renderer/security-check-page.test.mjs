import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { SECURITY_CHECK_CSP, SECURITY_CHECK_PARENT_ORIGIN, SECURITY_CHECK_RENDERER_URL, SECURITY_CHECK_PATH,
  SECURITY_CHECK_CANARY_PREFIX, renderSecurityCheckDocument } from './security-check-page.mjs'
import { assertSecurityCheckBundle, SECURITY_CHECK_ALLOWED_MODULES } from './security-check-build-policy.mjs'
import { fixedSecurityCheckConfig, isSecurityCheckLocation, securityCanaryUrl } from '../../scripts/isolated-security-config.mjs'

const options = { scriptPath: 'assets/security-script.js', scriptIntegrity: `sha384-${'a'.repeat(64)}`,
  stylePath: 'assets/security-style.css', styleIntegrity: `sha384-${'b'.repeat(64)}` }

test('deployed fixture is bound to exact HTTPS page and renderer with only exact canary reads', () => {
  assert.equal(SECURITY_CHECK_PARENT_ORIGIN, 'https://mage.peterbucci.com')
  assert.equal(SECURITY_CHECK_RENDERER_URL, 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html')
  assert.equal(SECURITY_CHECK_PATH, '/player-check/security/')
  assert.equal(SECURITY_CHECK_CANARY_PREFIX, '/player-check/__isolated-security/')
  assert(SECURITY_CHECK_CSP.includes(`frame-src ${SECURITY_CHECK_RENDERER_URL};`))
  assert(SECURITY_CHECK_CSP.includes(`connect-src ${SECURITY_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_CANARY_PREFIX}register ${SECURITY_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_CANARY_PREFIX}results;`))
  assert(!/unsafe-|blob:|\*/.test(SECURITY_CHECK_CSP))
  assert(SECURITY_CHECK_CSP.startsWith("default-src 'none'; script-src 'self'; style-src 'self';"))
  const exact = `${SECURITY_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_PATH}`
  assert(isSecurityCheckLocation('deployed', exact, false))
  for (const value of [exact + '?renderer=https://other.example', exact + '#code', exact + 'index.html', exact.replace('https:', 'http:'),
    exact.replace('mage.peterbucci.com', 'other.peterbucci.com'), exact.replace('https://', 'https://name:private@'), 'http://127.0.0.1:5178/scripts/isolated-security-check.html']) {
    assert.equal(isSecurityCheckLocation('deployed', value, false), false, value)
  }
})

test('local fixture remains development-only on its exact existing loopback address', () => {
  const config = fixedSecurityCheckConfig('local')
  assert.equal(config.rendererUrl, 'http://localhost:5181/index.html')
  assert.equal(config.canaryPrefix, '/__isolated-security/')
  const url = config.parentOrigin + config.path
  assert(isSecurityCheckLocation('local', url, true))
  assert.equal(isSecurityCheckLocation('local', url, false), false)
  assert.equal(isSecurityCheckLocation('local', url.replace('127.0.0.1', '192.168.1.1'), true), false)
  assert.throws(() => fixedSecurityCheckConfig('custom'), /Unknown/)
})

test('fixed network probes use wss on HTTPS and cannot select another endpoint', () => {
  const nonce = 'a'.repeat(32)
  assert.equal(securityCanaryUrl('deployed', nonce, 'socket', true), `wss://mage.peterbucci.com/player-check/__isolated-security/canary?nonce=${nonce}&kind=socket`)
  assert.equal(securityCanaryUrl('local', nonce, 'socket', true), `ws://127.0.0.1:5178/__isolated-security/canary?nonce=${nonce}&kind=socket`)
  assert.throws(() => securityCanaryUrl('deployed', 'x', 'fetch'), /Invalid/)
  assert.throws(() => securityCanaryUrl('deployed', nonce, '../api/account'), /Invalid/)
})

test('page contains fixed opt-in controls and integrity-protected external assets only', () => {
  const html = renderSecurityCheckDocument(options)
  for (const id of ['boundary', 'failures', 'stall', 'stop', 'player', 'status', 'results', 'summary', 'saved-runs', 'download', 'show-report', 'report-json']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, id)
  }
  assert(html.includes('id="stall" disabled>Historical CPU stall'))
  assert(html.includes('id="failures" disabled>Check current renderer recovery'))
  assert(html.includes('Unsupported context-loss support is not a pass'))
  assert(html.includes('three seconds'))
  assert(html.includes('does not replace testing normal MAGE pages'))
  assert(html.includes('href="/player-check/worker/"'))
  assert(html.includes('must not be treated as evidence for the current compiler-worker boundary'))
  assert(!/<input|<textarea|<style|<form|\son\w+=/.test(html))
  assert.equal((html.match(/<script/g) ?? []).length, 1)
  assert(html.includes(`src="./${options.scriptPath}" integrity="${options.scriptIntegrity}" defer`))
  assert(html.includes(`href="./${options.stylePath}" integrity="${options.styleIntegrity}"`))
  assert(html.includes(`content="${SECURITY_CHECK_CSP}"`))
  for (const scriptPath of ['../security.js', 'https://other.example/security.js', 'assets/security.js?x=1', 'assets/security.js" onload="code']) {
    assert.throws(() => renderSecurityCheckDocument({ ...options, scriptPath }), /asset path/)
  }
  assert.throws(() => renderSecurityCheckDocument({ ...options, scriptIntegrity: 'sha384-unverified' }), /integrity/)
})

test('build fails closed on app/auth/engine modules, extra chunks and external imports', () => {
  const root = resolve('fixture-root')
  const chunk = { type: 'chunk', imports: [], dynamicImports: [], modules: Object.fromEntries(SECURITY_CHECK_ALLOWED_MODULES.map(path => [resolve(root, path), {}])) }
  assertSecurityCheckBundle({ 'security.js': chunk }, root)
  for (const path of ['src/modules/auth/index.ts', 'src/app/index.ts', 'src/modules/player/infrastructure/engineAdapter.ts', 'node_modules/@notrac/mage/dist/mage-engine.js', '.local/private-config.mjs']) {
    assert.throws(() => assertSecurityCheckBundle({ 'security.js': { ...chunk, modules: { ...chunk.modules, [resolve(root, path)]: {} } } }, root), /Unexpected module/)
  }
  assert.throws(() => assertSecurityCheckBundle({ first: chunk, second: chunk }, root), /one self-contained/)
  assert.throws(() => assertSecurityCheckBundle({ first: { ...chunk, imports: ['external.js'] } }, root), /one self-contained/)
  assert.throws(() => assertSecurityCheckBundle({ first: { ...chunk, dynamicImports: ['external.js'] } }, root), /one self-contained/)
})
