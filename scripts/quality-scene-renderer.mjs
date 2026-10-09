// Development-only harness. Frames come from the same engine as the scene player.
import { createIsolatedPlayer } from '../src/modules/player/isolation/isolatedPlayer.ts';
import { getIsolatedRendererUrl } from '../src/modules/player/isolation/rendererConfig.ts';
import { validateSceneForPlayback } from '../src/modules/player/policy/sceneValidation.ts';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
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

export function createQualityRenderer(container) {
  let player;
  async function capture() {
    return URL.createObjectURL(await player.capture({ width: 640, height: 360, type: 'image/png' }));
  }
  return {
    async captureScene(sceneData, { checkAudio = false } = {}) {
      const validated = validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: sceneData });
      if (validated.kind !== 'custom') throw new Error('The quality corpus requires explicit engine data.');
      sceneData = validated.scene;
      player ??= createIsolatedPlayer({ container, rendererUrl: getIsolatedRendererUrl(), profile: 'preview' });
      await player.ready;
      player.pause(); player.clearAudio(); player.setSynthetic(false);
      const objectUrls = [];
      try {
        await player.loadScene({ schemaVersion: 1, kind: 'custom', scene: { ...sceneData, visualizer: { ...sceneData.visualizer, shader: 'let size = input(); let pointerDown = input(); sphere(0.00001);' } } });
        const backgroundUrl = await capture(); objectUrls.push(backgroundUrl);
        const background = await readPixels(backgroundUrl);
        await player.loadScene(validated);
        await player.play();
        const startedAt = performance.now(), samples = []; let best;
        // Observe actual child frames. Private engine state and arbitrary time/input
        // mutation are intentionally unavailable across the isolation boundary.
        for (let sample = 0; sample < 9; sample++) {
          await delay(550);
          const dataUrl = await capture(); objectUrls.push(dataUrl);
          const phase = (performance.now() - startedAt) / 1000;
          const stats = await measure(dataUrl, background);
          const valid = stats.central > 0.0015 && stats.colored < 0.6 && stats.edge < 0.035 && stats.deviation > 5;
          samples.push({ phase, ...stats, valid });
          const score = stats.central * 100 + stats.deviation / 40 - stats.edge * 100;
          if (!best || score > best.score) best = { phase, score, dataUrl };
        }
        let audio = null;
        if (checkAudio) {
          const url = testTone();
          try {
            await player.loadAudio(url); await player.play(); await delay(500);
            const state = player.getAudioState();
            audio = { loaded: state.loaded, elapsed: state.time, playing: state.playing,
              note: 'Transport check only; visual reactivity is verified in the isolated playback check.' };
          } finally { player.pause(); player.clearAudio(); URL.revokeObjectURL(url); }
        }
        if (!best) throw new Error('No thumbnail candidate.');
        const dataUrl = await new Promise((resolve, reject) => {
          fetch(best.dataUrl).then(response => response.blob()).then(blob => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
          }, reject);
        });
        return { dataUrl, selectedPhase: best.phase, sampleDurationSeconds: (performance.now() - startedAt) / 1000, samples, audio,
          note: 'Early animation samples only; no claim of distant-phase or private-uniform inspection.',
          valid: samples.every(sample => sample.valid) && (!audio || (audio.loaded && audio.elapsed > 0)) };
      } finally { player.pause(); for (const url of objectUrls) URL.revokeObjectURL(url); }
    },
    dispose() { player?.dispose(); player = undefined; },
  };
}
