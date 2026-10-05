import { resolve } from 'node:path'
import { LIVE_CHECK_PARENT_ORIGIN, LIVE_CHECK_RENDERER_URL } from './live-check-page.mjs'
import { SECURITY_CHECK_CANARY_PREFIX } from './security-check-page.mjs'

export const WORKER_CHECK_PARENT_ORIGIN = LIVE_CHECK_PARENT_ORIGIN
export const WORKER_CHECK_RENDERER_URL = LIVE_CHECK_RENDERER_URL
export const WORKER_CHECK_PATH = '/player-check/worker/'
export const WORKER_CHECK_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  `frame-src ${WORKER_CHECK_RENDERER_URL}`,
  `connect-src ${['register', 'results', 'canary'].map(path => `${WORKER_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_CANARY_PREFIX}${path}`).join(' ')}`,
  "worker-src 'none'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ')

export const WORKER_CHECK_ALLOWED_MODULES = Object.freeze([
  'scripts/isolated-worker-check.ts',
  'scripts/worker-check-fixture.ts',
  'scripts/worker-boundary.ts',
  'scripts/worker-check-canary.ts',
])

export function assertWorkerCheckBundle(bundle, root) {
  const outputs = Object.values(bundle)
  if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].imports.length || outputs[0].dynamicImports.length) {
    throw new Error('Worker check parent must contain exactly one self-contained script.')
  }
  const allowed = new Set(WORKER_CHECK_ALLOWED_MODULES.map(path => resolve(root, path).replaceAll('\\', '/')))
  for (const id of Object.keys(outputs[0].modules)) {
    if (!allowed.has(id.replaceAll('\\', '/'))) throw new Error(`Unexpected module in fixed worker-check parent: ${id}`)
  }
}

export function renderWorkerCheckDocument({ scriptPath, scriptIntegrity, stylePath, styleIntegrity }) {
  if (!/^assets\/worker-[a-zA-Z0-9_-]+\.js$/.test(scriptPath) || !/^assets\/worker-[a-zA-Z0-9_-]+\.css$/.test(stylePath)) {
    throw new Error('Unexpected worker-check asset path.')
  }
  for (const integrity of [scriptIntegrity, styleIntegrity]) if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Unexpected worker-check asset integrity.')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${WORKER_CHECK_CSP}"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<title>MAGE compiler worker check</title><link rel="stylesheet" href="./${stylePath}" integrity="${styleIntegrity}"></head>
<body><main><a href="/player-check/">Music and controls check</a><h1>Compiler worker check</h1>
<p>These fixed checks exercise MAGE's disposable compiler worker inside the separate renderer. They use only fixed sources, do not access account data, and do not enable custom-shader playback.</p>
<p>Keep this page visible. The actual compiler-worker checks record attempted calls and worker lifetime, including failures, cancellation, fresh workers for repeated jobs and termination before delayed callbacks. Finite three-second loops use a two-second compiler deadline. A separate fixed policy observation worker runs for 600 milliseconds under the same opaque child Content Security Policy, allowing time to observe network blocks independently of compiler termination. It does not run through the compiler.</p>
<p>A credential-free positive control verifies the bounded request counter before the network checks. Storage probes use fresh names without reading existing values. CacheStorage NOT_EXPOSED means the browser does not expose that API; it does not claim an opening was denied. These checks never run an infinite loop or GPU stress test.</p>
<div class="actions"><button id="start" disabled>Run fixed worker checks</button><button id="stop">Stop checks</button></div>
<div id="player" aria-label="Opaque worker check frame"></div><p id="status" role="status">Preparing the fixed worker checks…</p>
<table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody id="results"></tbody></table><p id="summary"></p>
<h2>Save the results</h2><p id="saved-runs"></p>
<div class="actions"><button id="download" disabled>Download results JSON</button><button id="show-report" disabled>Show report JSON</button></div>
<pre id="report-json" hidden tabindex="0"></pre>
<p>Reports distinguish actual compiler-worker attempted calls and lifetime from the separate policy observation worker and bounded request counts. They contain fixed outcomes, browser information, bounded timing and worker lifecycle events. They exclude scene source, raw errors, account data and storage values. These fixed network checks do not establish GPU safety, normal app behavior or full browser release approval. Reloading clears this tab's history.</p>
<a href="/player-check/security/">Browser safety checks</a><p><a href="/">Back to MAGE</a></p>
<noscript><p>JavaScript is required for these fixed checks.</p></noscript></main>
<script src="./${scriptPath}" integrity="${scriptIntegrity}" defer></script></body></html>
`
}
