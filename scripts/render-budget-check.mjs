// Development-only fixed templates; the engine lives only in the isolated child.
import { createIsolatedPlayer } from '../src/modules/player/isolation/isolatedPlayer.ts';
import { getIsolatedRendererUrl } from '../src/modules/player/isolation/rendererConfig.ts';
const button = document.querySelector('#run'), status = document.querySelector('#status');
const rows = document.querySelector('#rows'), report = document.querySelector('#report'), stage = document.querySelector('#stage');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const scenarios = [
  { profile: 'full', width: 1920, height: 1080 }, { profile: 'full', width: 3840, height: 2160 },
  { profile: 'full', width: 390, height: 844 }, { profile: 'preview', width: 1280, height: 720 },
  { profile: 'preview', width: 390, height: 844 },
];
button.addEventListener('click', async () => {
  button.disabled = true; rows.replaceChildren(); report.textContent = ''; status.textContent = 'Running...';
  const results = [];
  try {
    for (const scenario of scenarios) {
      const container = document.createElement('div');
      container.style.width = `${scenario.width}px`; container.style.height = `${scenario.height}px`; stage.replaceChildren(container);
      const player = createIsolatedPlayer({ container, rendererUrl: getIsolatedRendererUrl(), profile: scenario.profile });
      try {
        await player.loadScene({ schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1 });
        await player.play(); await wait(350);
        const bitmap = await createImageBitmap(await player.capture({ width: 640, height: 360, type: 'image/png' }));
        const capture = { width: bitmap.width, height: bitmap.height }; bitmap.close();
        if (capture.width * capture.height > 230400 || Math.max(capture.width, capture.height) > 640) throw new Error('Capture exceeded preview budget');
        await wait(550);
        const oversized = await createImageBitmap(await player.capture({ width: 10000, height: 10000 }));
        const fittedCapture = { width: oversized.width, height: oversized.height }; oversized.close();
        if (fittedCapture.width * fittedCapture.height > 230400 || Math.max(fittedCapture.width, fittedCapture.height) > 640) throw new Error('Oversized request escaped capture bounds');
        container.style.width = '7680px'; container.style.height = '4320px'; await wait(550);
        const resized = await player.capture({ width: 640, height: 360 });
        if (!resized.size || !container.querySelector('iframe') || container.querySelector('canvas')) throw new Error('Isolated resize or capture failed');
        results.push({ ...scenario, capture, fittedCapture, resizeCaptureBytes: resized.size, passed: true });
        const row = rows.insertRow();
        for (const value of [`${scenario.profile}: ${scenario.width} x ${scenario.height}`, `${capture.width} x ${capture.height}`, 'PASS']) row.insertCell().textContent = value;
      } finally { player.dispose(); stage.replaceChildren(); }
    }
    status.textContent = 'PASS - isolated capture and resize checks passed';
  } catch (error) { status.textContent = `FAIL - ${error.message}`; }
  finally {
    report.textContent = JSON.stringify({ checkedAt: new Date().toISOString(), browser: navigator.userAgent, devicePixelRatio,
      note: 'Desktop viewport simulation. Child buffer, iterations, and FPS remain covered by engine policy tests; this page cannot inspect child internals.', results }, null, 2);
    button.disabled = false;
  }
});
