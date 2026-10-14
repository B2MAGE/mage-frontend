import test from 'node:test'
import assert from 'node:assert/strict'
import { fixedSecurityCheckConfig, isSecurityCheckLocation, securityCanaryUrl } from './isolated-security-config.mjs'

test('manual security checks require the exact local development address', () => {
  const config = fixedSecurityCheckConfig()
  assert(Object.isFrozen(config))
  assert.equal(config.rendererUrl, 'http://localhost:5181/index.html')
  assert.equal(config.canaryPrefix, '/__isolated-security/')
  const address = config.parentOrigin + config.path
  assert(isSecurityCheckLocation(address, true))
  assert.equal(isSecurityCheckLocation(address, false), false)
  for (const value of [address + '?renderer=other', address + '#code', address + '/index.html',
    address.replace('127.0.0.1', '192.168.1.1'), address.replace('http://', 'http://name:private@'),
    'https://mage.peterbucci.com/player-check/security/', 'not a URL']) {
    assert.equal(isSecurityCheckLocation(value, true), false, value)
  }
})

test('fixed local canary probes cannot select another endpoint', () => {
  const nonce = 'a'.repeat(32)
  assert.equal(securityCanaryUrl(nonce, 'fetch'), `http://127.0.0.1:5178/__isolated-security/canary?nonce=${nonce}&kind=fetch`)
  assert.equal(securityCanaryUrl(nonce, 'socket', true), `ws://127.0.0.1:5178/__isolated-security/canary?nonce=${nonce}&kind=socket`)
  assert.throws(() => securityCanaryUrl('invalid', 'fetch'), /Invalid/)
  assert.throws(() => securityCanaryUrl(nonce, '../api/account'), /Invalid/)
})
