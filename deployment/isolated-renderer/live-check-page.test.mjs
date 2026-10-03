import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE_CHECK_CSP, LIVE_CHECK_PARENT_ORIGIN, LIVE_CHECK_RENDERER_URL, renderLiveCheckDocument } from './live-check-page.mjs'

const documentOptions = {
  scriptPath: 'assets/check-script.js', scriptIntegrity: `sha384-${'a'.repeat(64)}`,
  stylePath: 'assets/check-style.css', styleIntegrity: `sha384-${'b'.repeat(64)}`,
}

test('the live fixture binds to the deployed parent and exact separate player site', () => {
  assert.equal(LIVE_CHECK_PARENT_ORIGIN, 'https://mage.peterbucci.com')
  assert.equal(LIVE_CHECK_RENDERER_URL, 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html')
  assert(LIVE_CHECK_CSP.includes("default-src 'none'"))
  assert(LIVE_CHECK_CSP.includes('frame-src https://d2wwpgc7sgvmnm.cloudfront.net'))
  assert(LIVE_CHECK_CSP.includes("connect-src 'none'"))
  assert(!LIVE_CHECK_CSP.includes('unsafe-inline'))
  assert(!LIVE_CHECK_CSP.includes('unsafe-eval'))
})

test('the page references only relative external assets with integrity and no inline script or style', () => {
  const html = renderLiveCheckDocument(documentOptions)
  assert(html.includes(`content="${LIVE_CHECK_CSP}"`))
  assert(html.includes('name="robots" content="noindex,nofollow"'))
  assert(html.includes(`href="./${documentOptions.stylePath}" integrity="${documentOptions.styleIntegrity}"`))
  assert(html.includes(`<script src="./${documentOptions.scriptPath}" integrity="${documentOptions.scriptIntegrity}" defer></script>`))
  assert(!html.includes('<style'))
  assert.equal((html.match(/<script/g) || []).length, 1)
  assert(html.includes('id="start" disabled'))
})

test('untrusted asset paths and invalid integrity cannot enter the document', () => {
  for (const scriptPath of ['https://other.invalid/check.js', '../check.js', 'assets/check.js?x=1', 'assets/check.js" onload="alert(1)']) {
    assert.throws(() => renderLiveCheckDocument({ ...documentOptions, scriptPath }), /asset path/)
  }
  assert.throws(() => renderLiveCheckDocument({ ...documentOptions, scriptIntegrity: 'sha384-unverified' }), /integrity/)
})
