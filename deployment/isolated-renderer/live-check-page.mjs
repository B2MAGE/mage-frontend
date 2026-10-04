export const LIVE_CHECK_PARENT_ORIGIN = 'https://mage.peterbucci.com'
export const LIVE_CHECK_RENDERER_URL = 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'
export const LIVE_CHECK_CSP = [
  "default-src 'none'", "script-src 'self' blob:", "worker-src blob:", "style-src 'self'", "img-src blob:",
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
  <title>MAGE live music player check</title>
  <link rel="stylesheet" href="./${stylePath}" integrity="${styleIntegrity}">
</head>
<body>
  <main>
    <a class="back" href="/">Back to MAGE</a>
    <h1>Live music player check</h1>
    <p>Start the player, then play the test rhythm or choose a local audio file. Switch scenes while music plays, click or drag the scene, and scroll over it to zoom.</p>
    <p>Music stays in this page. The separate player receives sound measurements only. Files are not uploaded, and this check does not access your account or saved scenes.</p>
    <div class="actions">
      <button id="start" disabled>Start player</button>
      <button id="stop" disabled>Stop player</button>
      <button id="switch" disabled>Switch scene</button>
      <button id="pause" disabled>Pause</button>
      <button id="reset" disabled>Reset</button>
    </div>
    <div id="player" aria-label="Isolated music scene"></div>
    <p id="status" role="status">Preparing the live music player check…</p>
    <p id="boundary">Isolation: not tested.</p>
    <h2>Music</h2>
    <div class="actions">
      <button id="test-audio" disabled>Play test rhythm</button>
      <label>Choose music <input id="audio" type="file" accept="audio/*" disabled></label>
      <button id="clear" disabled>Clear music</button>
    </div>
    <p class="detail">Local audio files up to 64 MiB. The test rhythm plays for 30 seconds.</p>
    <div class="actions">
      <label>Volume <input id="volume" type="range" min="0" max="1" step="0.05" value="0.4" disabled></label>
      <button id="seek" disabled>Back five seconds</button>
      <label>Response <select id="response" disabled><option value="mapped-v1">Selective</option><option value="legacy">Original</option></select></label>
      <label><input id="simulate" type="checkbox" disabled> Simulate beat</label>
    </div>
    <p id="audio-status" aria-live="off">No music loaded.</p>
    <h2>Checks</h2>
    <div class="actions">
      <button id="capture-button" disabled>Capture frame</button>
      <button id="unavailable" disabled>Test unavailable player</button>
    </div>
    <img id="capture" alt="Captured isolated scene" hidden>
    <p id="stop-result" class="detail">Stop: not tested.</p>
    <p id="retry-result" class="detail">Connection: not tested.</p>
    <p class="detail">Player address: <code id="address"></code></p>
    <p class="detail">The isolation check confirms that this page cannot access the player document and that the frame allows scripts only. It is not a complete security audit.</p>
    <p class="detail">Normal MAGE players also use this bridge. This fixed check does not test every browser boundary, saved-scene permission or owner recovery path, and does not approve public custom-shader playback.</p>
    <noscript><p>Enable JavaScript to run this check.</p></noscript>
  </main>
  <script src="./${scriptPath}" integrity="${scriptIntegrity}" defer></script>
</body>
</html>
`
}
