import engineSource from '@notrac/mage?raw'
import { AudioAnalysisKernel, type AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { AudioResponseMapper, type AudioResponseEvent, type AudioResponseOutputs } from '@notrac/mage/audio-mapping'
import { describe, expect, it } from 'vitest'

const DURATION = 3
const ATTACKS = [0.31, 0.74, 1.08]
const mappings = {
  version: 1,
  mappings: [
    { target: 'size', source: 'bass-hit', amount: 1.4, attack: 0.02, release: 0.08 },
    { target: 'bass', source: 'bass-level', amount: 1.8, attack: 0.025, release: 0.15 },
    { target: 'mid', source: 'mid-level', amount: 1, attack: 0.025, release: 0.15 },
    { target: 'treble', source: 'treble-level', amount: 1, attack: 0.025, release: 0.15 },
    { target: 'audioLevel', source: 'overall-level', amount: 1, attack: 0.025, release: 0.15 },
    { target: 'audioHit', source: 'overall-hit', amount: 0.5, attack: 0.01, release: 0.12 },
  ],
}

// Attacks deliberately fall between most display frames; the last half is silence.
function pcm(time: number) {
  const bassOn = ATTACKS.some(start => time >= start && time < start + 0.07)
  const trebleOn = ATTACKS.some(start => time >= start - 0.03 && time < start - 0.02)
  const tone = (hz: number, amplitude: number) => Math.sin(2 * Math.PI * hz * time) * amplitude
  const accompanimentFade = Math.max(0, Math.min(1, (1.4 - time) / 0.1))
  return tone(90, bassOn ? 0.45 : 0) + tone(700, 0.07 * accompanimentFade) + tone(5000, trebleOn ? 0.008 : 0)
}

function analyze(sampleRate: number) {
  const kernel = new AudioAnalysisKernel(sampleRate)
  const frames: AudioAnalysisFrame[] = []
  const sampleCount = Math.round(sampleRate * DURATION)
  for (let offset = 0; offset < sampleCount; offset += 128) {
    const samples = Float32Array.from({ length: Math.min(128, sampleCount - offset) }, (_, index) => pcm((offset + index) / sampleRate))
    frames.push(...kernel.process([samples], offset / sampleRate))
  }
  return frames
}

function replay(frames: AudioAnalysisFrame[], fps: number) {
  const mapper = new AudioResponseMapper(mappings)
  let next = 0
  let fastCursor = 0
  let slowCursor = 0
  const fastEvents: AudioResponseEvent[] = []
  const slowEvents: AudioResponseEvent[] = []
  const checkpoints: { time: number; outputs: AudioResponseOutputs }[] = []
  let maxBatchSize = 0
  for (let tick = 1; tick <= DURATION * fps; tick++) {
    const time = tick / fps
    const batch = []
    while (next < frames.length && frames[next].time <= time + 1e-9) batch.push(frames[next++])
    maxBatchSize = Math.max(maxBatchSize, batch.length)
    const outputs = mapper.process(batch, time)
    const events = mapper.getEvents(fastCursor)
    fastEvents.push(...events)
    fastCursor = events.at(-1)?.id ?? fastCursor
    // Another animation consumer reads its own cursor only every 200 ms.
    if (tick % (fps / 5) === 0) {
      const otherEvents = mapper.getEvents(slowCursor)
      slowEvents.push(...otherEvents)
      slowCursor = otherEvents.at(-1)?.id ?? slowCursor
    }
    if (tick % (fps / 10) === 0) checkpoints.push({ time, outputs })
  }
  return { mapper, checkpoints, fastEvents, slowEvents, maxBatchSize, consumedFrames: next }
}

describe('audio analysis to visual response integration', () => {
  it.each([44100, 48000])('preserves the complete PCM response through 30/60/120 FPS consumers at %s Hz', (sampleRate) => {
    const frames = analyze(sampleRate)
    const expectedHits = frames.flatMap(frame => frame.hits)
    expect(frames).toHaveLength(300)
    expect(expectedHits.filter(hit => hit.band === 'bass')).toHaveLength(ATTACKS.length)
    expect(expectedHits.some(hit => hit.band === 'treble')).toBe(true)
    const runs = [30, 60, 120].map(fps => replay(frames, fps))
    for (const run of runs) {
      expect(run.consumedFrames).toBe(frames.length)
      expect(run.fastEvents.map(({ band, time, strength }) => ({ band, time, strength }))).toEqual(expectedHits)
      expect(run.slowEvents).toEqual(run.fastEvents)
      expect(new Set(run.fastEvents.map(event => event.id)).size).toBe(expectedHits.length)
      expect(run.checkpoints.some(({ outputs }) => outputs.bass > 0.1 && outputs.mid > 0.01)).toBe(true)
      expect(run.checkpoints.some(({ outputs }) => outputs.size > 0.1 && outputs.audioHit > 0.05)).toBe(true)
      expect(Object.values(run.checkpoints.at(-1)!.outputs).every(value => value < 0.00002)).toBe(true)
    }
    expect(runs[0].maxBatchSize).toBeGreaterThan(1)
    expect(runs[0].checkpoints).toEqual(runs[1].checkpoints)
    expect(runs[1].checkpoints).toEqual(runs[2].checkpoints)
    expect(runs[0].fastEvents).toEqual(runs[2].fastEvents)
  })

  it('exposes measured event time and strength to shaders independently of fading output amount', () => {
    const frames = analyze(48000)
    const { mapper } = replay(frames, 30)
    const latestBass = frames.flatMap(frame => frame.hits).filter(hit => hit.band === 'bass').at(-1)!
    const latestOverall = frames.flatMap(frame => frame.hits).filter(hit => hit.band === 'overall').at(-1)!
    expect(latestBass.strength).toBeGreaterThan(0)
    expect(mapper.getSnapshot().outputs.size).toBeLessThan(0.00002)

    // Execute the installed engine API against the actual completed mapper, without a WebGL renderer.
    const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
    const start = engineSource.indexOf('\n\tgetAudioResponseOutputs(', engineStart)
    const end = engineSource.indexOf('\n\t}', start)
    if (start < engineStart || end <= start) throw new Error('Missing installed audio output API.')
    const method = engineSource.slice(start + 2, end + 3).replaceAll('this.#', 'this.')
    const getOutputs = new Function(`return function ${method}`)() as (this: { audioMapper: AudioResponseMapper; mappedTime: number }) => Record<string, number>
    const outputs = getOutputs.call({ audioMapper: mapper, mappedTime: DURATION })
    expect(outputs.audioTime).toBe(DURATION)
    expect(outputs.bassHitTime).toBe(latestBass.time)
    expect(outputs.bassHitStrength).toBe(latestBass.strength)
    expect(outputs.audioHitTime).toBe(latestOverall.time)
    expect(outputs.audioHitStrength).toBe(latestOverall.strength)
    expect(outputs.audioHit).toBeLessThan(outputs.audioHitStrength / 1000)
  })
})
