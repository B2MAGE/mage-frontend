import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRendererBuild } from './serve-isolated-renderer.mjs'
import { assertNonCredentialedResponse, integrityOf } from '../deployment/isolated-renderer/hosting-policy.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const production = process.argv.includes('--production')
const { manifest } = await loadRendererBuild(resolve(root, production ? 'dist-isolated-renderer-production' : 'dist-isolated-renderer'))
assert.equal(manifest.production, production, 'Verification mode must match the renderer build.')
if (production) assert(process.env.MAGE_RENDERER_VERIFY_ORIGIN, 'Set the deployed renderer origin before production verification.')
const base = new URL(process.env.MAGE_RENDERER_VERIFY_ORIGIN ?? 'http://localhost:5181')
assert.equal(base.origin, base.href.slice(0, -1), 'Verification target must be an origin, not a path or query.')
assert(['http:', 'https:'].includes(base.protocol))
if (production) assert.equal(base.protocol, 'https:', 'Production verification requires HTTPS.')
const checkHeaders = (response) => {
  for (const [name, value] of Object.entries(manifest.headers)) assert.equal(response.headers.get(name), value, `${name} differs from the built hosting policy`)
  assertNonCredentialedResponse(response.headers)
}
const documentResponse = await fetch(base, { redirect: 'error', headers: { Origin: 'null' } })
assert.equal(documentResponse.status, 200)
checkHeaders(documentResponse)
assert.equal(documentResponse.headers.get('cache-control'), 'no-store')
const html = await documentResponse.text()
assert(html.includes(`integrity="${manifest.scriptIntegrity}"`))
assert(!html.includes('type="module"'), 'Opaque renderer requires one classic script')
const scriptResponse = await fetch(new URL(manifest.bundlePath, base), { redirect: 'error', headers: { Origin: 'null' } })
assert.equal(scriptResponse.status, 200)
checkHeaders(scriptResponse)
assert.equal(integrityOf(Buffer.from(await scriptResponse.arrayBuffer())), manifest.scriptIntegrity)
for (const path of ['/api/auth/me', '/anything', '/hosting-manifest.json', '/build-audit.json', '/index.html?token=must-not-be-accepted']) {
  const response = await fetch(new URL(path, base), { redirect: 'error' })
  assert(response.status >= 400 && response.status < 500, `Unexpected public renderer path: ${path}`)
  // CloudFront edge rejections carry a stricter CSP with no scripts; the local server retains its full policy.
  assert(response.headers.get('content-security-policy')?.includes("default-src 'none'"))
  assert(response.headers.get('content-security-policy')?.includes('sandbox allow-scripts'))
}
const post = await fetch(base, { method: 'POST', body: 'must-not-be-forwarded', redirect: 'error' })
assert(post.status >= 400 && post.status < 500)
console.log(`Renderer headers, immutable asset, and route/method restrictions verified at ${base.origin}. Browser isolation and WebGL checks are still required.`)
