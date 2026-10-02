// Development-only harness. Frames come from the same engine as the scene player.
import { initMAGE } from '@notrac/mage';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const frames = async count => {
  for (let index = 0; index < count; index++) await new Promise(requestAnimationFrame);
};

async function readPixels(dataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 90;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

async function measure(dataUrl, background) {
  const pixels = await readPixels(dataUrl);
  let colored = 0; let central = 0; let sum = 0; let square = 0; let edge = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const x = (i / 4) % 160; const y = Math.floor(i / 4 / 160);
    const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += luminance; square += luminance * luminance;
    const difference = Math.max(...[0, 1, 2].map(channel => Math.abs(pixels[i + channel] - background[i + channel])));
    if (difference > 18) {
      colored++;
      if (x > 35 && x < 125 && y > 8 && y < 82) central++;
      if (x < 5 || x > 154 || y < 5 || y > 84) edge++;
    }
  }
  const count = pixels.length / 4;
  return { colored: colored / count, central: central / count, edge: edge / count,
    deviation: Math.sqrt(square / count - (sum / count) ** 2) };
}

function testTone() {
  const sampleRate = 44100; const samples = sampleRate * 6;
  const buffer = new ArrayBuffer(44 + samples * 2); const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate; const envelope = Math.exp(-8 * (t % 0.5));
    const signal = envelope * (0.35 * Math.sin(2 * Math.PI * 90 * t) + 0.25 * Math.sin(2 * Math.PI * 350 * t) + 0.35 * Math.sin(2 * Math.PI * 1400 * t));
    view.setInt16(44 + i * 2, Math.round(signal * 32700), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function createQualityRenderer(canvas) {
  const engine = initMAGE({ canvas, log: false, withControls: { active: false, integrated: false }, autoStart: false });
  engine.start();
  return {
    async captureScene(sceneData, { checkAudio = false } = {}) {
      engine.pause(); engine.unloadAudio(); engine.setSyntheticPreview(false);
      // Compare each frame against its own skybox, not a color heuristic: white
      // geometry is valid, but a starfield without geometry must fail.
      engine.loadPreset({ ...sceneData, visualizer: { ...sceneData.visualizer, shader: 'let size = input(); let pointerDown = input(); sphere(0.00001);' } });
      engine.start(); await delay(300); await frames(3); engine.pause();
      const background = await readPixels(await engine.captureFramePreview({ width: 640, height: 360 }));
      if (!engine.loadPreset(sceneData)) throw new Error('Scene rejected by MAGE');
      engine.start(); await delay(220); await frames(5);
      const startTime = engine.getEngineTime(); await frames(8);
      const endTime = engine.getEngineTime();
      if (!(endTime > startTime)) throw new Error(`Animation clock did not advance: ${startTime} -> ${endTime}`);
      const idleSize = engine.toPreset().state.size;
      engine.pause();
      const samples = []; let best;
      for (const phase of [0.5, 3.5, 8, 15, 30, 55, 90, 145, 179]) {
        engine.loadPreset({ audioResponse: sceneData.audioResponse, state: { time: phase, size: idleSize } });
        const dataUrl = await engine.captureFramePreview({ width: 640, height: 360, type: 'image/png' });
        if (!dataUrl) throw new Error('Engine did not return a captured frame');
        const stats = await measure(dataUrl, background);
        const valid = stats.central > 0.0015 && stats.colored < 0.6 && stats.edge < 0.035 && stats.deviation > 5;
        samples.push({ phase, ...stats, valid });
        const score = stats.central * 100 + stats.deviation / 40 - stats.edge * 100;
        if (phase <= 8 && (!best || score > best.score)) best = { phase, score, dataUrl };
      }
      // Stress loud input at distant animation points without changing the saved scene.
      for (const phase of [15, 90, 179]) {
        engine.loadPreset({ audioResponse: sceneData.audioResponse, state: { time: phase, size: 0.9 } });
        const stats = await measure(await engine.captureFramePreview({ width: 640, height: 360 }), background);
        samples.push({ phase, peakInput: true, ...stats, valid: stats.central > 0.0015 && stats.colored < 0.6 && stats.edge < 0.035 && stats.deviation > 5 });
      }
      let audio = null;
      if (checkAudio) {
        engine.loadPreset({ audioResponse: sceneData.audioResponse, state: { time: 1, size: idleSize } });
        const url = testTone();
        try {
          engine.loadAudio(url);
          for (let attempt = 0; attempt < 100 && !engine.isAudioLoaded(); attempt++) await delay(50);
          if (!engine.isAudioLoaded()) throw new Error('Local test audio did not load');
          engine.play();
          const sizes = [];
          for (let i = 0; i < 24; i++) { await delay(70); sizes.push(engine.toPreset().state.size); }
          audio = { idleSize, min: Math.min(...sizes), max: Math.max(...sizes), elapsed: engine.getAudioTime(), loaded: engine.isAudioLoaded() };
          audio.reactive = audio.max > idleSize + 0.04 && audio.max - audio.min > 0.025 && audio.elapsed > 0;
        } finally { engine.pause(); engine.unloadAudio(); URL.revokeObjectURL(url); }
      }
      if (!best) throw new Error('No visible, well-framed thumbnail candidate: ' + JSON.stringify(samples));
      return { dataUrl: best.dataUrl, selectedPhase: best.phase, clockAdvanced: endTime - startTime, samples, audio,
        valid: samples.every(sample => sample.valid) && (!audio || audio.reactive) };
    },
    dispose() { engine.dispose(); },
  };
}
