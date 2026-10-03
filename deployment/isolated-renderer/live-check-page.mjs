export const LIVE_CHECK_PARENT_ORIGIN = 'https://mage.peterbucci.com'
export const LIVE_CHECK_RENDERER_URL = 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'
export const LIVE_CHECK_CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  `frame-src ${new URL(LIVE_CHECK_RENDERER_URL).origin}`,
  "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ')

export function renderLiveCheckDocument({ scriptPath, scriptIntegrity, stylePath, styleIntegrity }) {
  for (const path of [scriptPath, stylePath]) {
    if (!/^assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(path)) throw new Error('Unexpected live-check asset path.')
  }
  for (const integrity of [scriptIntegrity, styleIntegrity]) {
    if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) throw new Error('Unexpected live-check asset integrity.')
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${LIVE_CHECK_CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow">
  <title>MAGE live player check</title>
  <link rel="stylesheet" href="./${stylePath}" integrity="${styleIntegrity}">
</head>
<body>
  <main>
    <a class="back" href="/">Back to MAGE</a>
    <h1>Live player check</h1>
    <p>This sample runs in the separately hosted player. It does not load your account, music, or saved scenes.</p>
    <p>Start the sample, stop it, then test an unavailable player and retry. This page leaves the normal MAGE players unchanged.</p>
    <div class="actions">
      <button id="start" disabled>Start sample</button>
      <button id="stop" disabled>Stop player</button>
      <button id="unavailable" disabled>Test unavailable player</button>
    </div>
    <div id="player" aria-label="Isolated sample player"></div>
    <p id="status" role="status">Preparing the live player check…</p>
    <ul class="checks" aria-label="Test results" aria-live="polite">
      <li id="render-result">Sample: not tested.</li>
      <li id="boundary-result">Isolation: not tested.</li>
      <li id="stop-result">Stop: not tested.</li>
      <li id="retry-result">Unavailable player and retry: not tested.</li>
    </ul>
    <p class="detail">Player address: <code id="address"></code></p>
    <p class="detail">The isolation check confirms that this page cannot access the player document and that the frame allows scripts only. It is not a complete security audit.</p>
    <noscript><p>Enable JavaScript to run this check.</p></noscript>
  </main>
  <script src="./${scriptPath}" integrity="${scriptIntegrity}" defer></script>
</body>
</html>
`
}
