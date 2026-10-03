// Development-only, fixed fixtures. Do not turn this into a submitted-source harness.
import { initMAGE } from '@notrac/mage';
import { getRenderBudget } from '../src/modules/player/policy/renderBudget.ts';
import { validateSceneForPlayback } from '../src/modules/player/policy/sceneValidation.ts';
import { resolveSceneForPlayback } from '../src/modules/player/templates/resolveScene.ts';

const button = document.querySelector('#run');
const status = document.querySelector('#status');
const rows = document.querySelector('#rows');
const report = document.querySelector('#report');
const stage = document.querySelector('#stage');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const scenarios = [
  { profile: 'full', width: 1920, height: 1080, dpr: 3 },
  { profile: 'full', width: 3840, height: 2160, dpr: 3 },
  { profile: 'full', width: 390, height: 844, dpr: 3 },
  { profile: 'preview', width: 1280, height: 720, dpr: 3 },
  { profile: 'preview', width: 390, height: 844, dpr: 3 },
];
const scene = resolveSceneForPlayback(validateSceneForPlayback({
  schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1,
})).engineScene;
validateSceneForPlayback(scene);

button.addEventListener('click', async () => {
  button.disabled = true;
  rows.replaceChildren();
  report.textContent = '';
  status.textContent = 'Running…';
  const results = [];
  try {
    for (const scenario of scenarios) {
      const canvas = document.createElement('canvas');
      canvas.style.width = `${scenario.width}px`; canvas.style.height = `${scenario.height}px`;
      stage.replaceChildren(canvas);
      const budget = getRenderBudget(scenario.profile);
      const engine = initMAGE({ canvas, autoStart: false, pixelRatio: scenario.dpr, renderBudget: budget,
        withControls: { active: false, integrated: false }, log: false });
      let unsubscribe = () => {};
      try {
        engine.start(); engine.loadPreset(scene); engine.play();
        await wait(350);
        let frames = 0;
        unsubscribe = engine.subscribeRenderLifecycle(event => { if (event.type === 'frame') frames++; });
        const start = performance.now();
        await wait(1100);
        const elapsed = performance.now() - start;
        engine.pause(); unsubscribe();
        const fps = frames * 1000 / elapsed;
        const width = canvas.width, height = canvas.height;
        assert(width * height <= budget.maxRenderPixels, 'Render pixels exceeded');
        assert(Math.max(width, height) <= budget.maxLongestEdge, 'Longest edge exceeded');
        assert(fps <= budget.maxFramesPerSecond + 2, 'Frame rate exceeded');
        const fields = engine.getEngineFields();
        const material = fields.visualizer.mesh.material;
        const fragment = Array.isArray(material) ? material[0].fragmentShader : material.fragmentShader;
        const iterations = Number(fragment.match(/const int MAX_ITERATIONS = (\d+);/)?.[1]);
        assert(iterations > 0 && iterations <= 200, 'Iteration ceiling missing');
        const capture = await engine.captureFramePreview({ width: 10000, height: 10000, type: 'image/png' });
        const bitmap = await createImageBitmap(await (await fetch(capture)).blob());
        const captureSize = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        assert(captureSize.width * captureSize.height <= 230400 && Math.max(captureSize.width, captureSize.height) <= 640, 'Capture exceeded preview budget');
        // A resize on the same engine must retain the policy and update the framebuffer.
        canvas.style.width = '7680px'; canvas.style.height = '4320px';
        engine.play(); await wait(150); engine.pause();
        assert(canvas.width * canvas.height <= budget.maxRenderPixels && Math.max(canvas.width, canvas.height) <= budget.maxLongestEdge, 'Resize exceeded budget');
        const result = { ...scenario, buffer: { width, height }, frames, elapsedMs: Math.round(elapsed),
          framesPerSecond: Number(fps.toFixed(1)), iterations, capture: captureSize,
          resizedBuffer: { width: canvas.width, height: canvas.height }, passed: true };
        results.push(result);
        const row = document.createElement('tr');
        for (const value of [`${scenario.profile}: ${scenario.width} × ${scenario.height} @ ${scenario.dpr}`, `${width} × ${height}`, fps.toFixed(1), 'PASS']) {
          const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        rows.append(row);
      } finally { unsubscribe(); engine.dispose(); stage.replaceChildren(); }
    }
    status.textContent = 'PASS — all render, resize, capture and frame-rate checks passed';
  } catch (error) {
    status.textContent = `FAIL — ${error.message}`;
  } finally {
    report.textContent = JSON.stringify({ checkedAt: new Date().toISOString(), browser: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio, note: 'Desktop browser; mobile-sized viewports, not physical mobile hardware.', results }, null, 2);
    button.disabled = false;
  }
});
