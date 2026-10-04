import { SECURITY_CHECK_PARENT_ORIGIN, SECURITY_CHECK_RENDERER_URL, SECURITY_CHECK_PATH, SECURITY_CHECK_CANARY_PREFIX } from '../../scripts/isolated-security-config.mjs'
export { SECURITY_CHECK_PARENT_ORIGIN, SECURITY_CHECK_RENDERER_URL, SECURITY_CHECK_PATH, SECURITY_CHECK_CANARY_PREFIX }

export const SECURITY_CHECK_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  `frame-src ${SECURITY_CHECK_RENDERER_URL}`,
  `connect-src ${SECURITY_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_CANARY_PREFIX}register ${SECURITY_CHECK_PARENT_ORIGIN}${SECURITY_CHECK_CANARY_PREFIX}results`,
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ')

export function renderSecurityCheckDocument({ scriptPath, scriptIntegrity, stylePath, styleIntegrity }) {
  for (const path of [scriptPath, stylePath]) if (!/^assets\/security-[a-zA-Z0-9_-]+\.(js|css)$/.test(path)) throw new Error('Unexpected security-check asset path.')
  for (const integrity of [scriptIntegrity, styleIntegrity]) if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Unexpected security-check asset integrity.')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${SECURITY_CHECK_CSP}"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<title>MAGE browser safety checks</title><link rel="stylesheet" href="./${stylePath}" integrity="${styleIntegrity}"></head>
<body><main><a href="/player-check/">Music and controls check</a><h1>Browser safety checks</h1>
<p>These fixed checks use MAGE's separate player. They test browser boundaries, failure recovery and an optional short CPU stall. They do not access your account or saved scenes, and do not enable custom-shader playback.</p>
<p>Run each group on the actual browser and device you want to test. Keep this tab visible until the group finishes. Untested browsers and devices remain unapproved.</p>
<div class="actions"><button id="boundary" disabled>Check browser boundaries</button><button id="failures" disabled>Check failure recovery</button><button id="stall" disabled>Check a bounded CPU stall</button><button id="stop">Stop checks</button></div>
<p>The CPU check deliberately blocks only the child for three seconds. It never runs an infinite loop or GPU stress test. A passing result is not a guarantee against browser or GPU hangs.</p>
<div id="player" aria-label="Isolated test scene"></div><p id="status" role="status">Preparing the fixed safety checks…</p>
<table><thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead><tbody id="results"></tbody></table><p id="summary"></p>
<h2>Save the results</h2><p id="saved-runs"></p>
<div class="actions"><button id="download" disabled>Download results JSON</button><button id="show-report" disabled>Show report JSON</button></div>
<pre id="report-json" tabindex="0" hidden></pre>
<p>The report contains browser information, fixed check results, times and player addresses. It excludes account data, scene source, raw errors and storage values. If a download is unavailable, show the report and copy its text. Reloading clears this tab's history.</p>
<p>Passing these fixed probes does not replace testing normal MAGE pages, permission changes, owner recovery, or the full browser release checklist.</p>
<a href="/">Back to MAGE</a><noscript><p>JavaScript is required for these fixed checks.</p></noscript></main>
<script src="./${scriptPath}" integrity="${scriptIntegrity}" defer></script></body></html>
`
}
