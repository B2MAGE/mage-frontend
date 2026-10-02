import { describe, expect, it } from 'vitest'
import { AudioResponseMapper, SyntheticAudioFrames } from '@notrac/mage/audio-mapping'
import type { AudioAnalysisBand, AudioAnalysisFrame } from '@notrac/mage/audio-analysis'

function frame(sequence: number, bass = 0, hits: AudioAnalysisFrame['hits'] = []): AudioAnalysisFrame {
  return { sequence, time: sequence / 100, levels: { bass, mid: 0.4, treble: 0.2, overall: 0.6 }, hits }
}

function config(source = 'bass-level', target = 'bass', amount = 1, attack = 0, release = 0.1, sensitivity = 1) {
  return { version: 1, sensitivity, mappings: [{ source, target, amount, attack, release }] }
}

describe('installed audio response mappings', () => {
  it('routes only requested targets, including size together with separate band inputs', () => {
    const mapper = new AudioResponseMapper({ version: 1, mappings: [
      { source: 'bass-level', target: 'bass', amount: 2, attack: 0, release: 0 },
      { source: 'mid-level', target: 'size', amount: 0.5, attack: 0, release: 0 },
    ] })
    expect(mapper.process([frame(1, 0.7)], 0.01)).toEqual({ size: 0.2, bass: 1.4, mid: 0, treble: 0, audioLevel: 0, audioHit: 0 })
    mapper.setConfig(config())
    expect(mapper.process([frame(1, 0.7)], 0.01)).toEqual({ size: 0, bass: 0.7, mid: 0, treble: 0, audioLevel: 0, audioHit: 0 })
  })

  it('has identical sampled envelopes at 30, 60 and 120 rendered frames per second', () => {
    const samples = Array.from({ length: 200 }, (_, index) => frame(index + 1, index < 80 ? 0.8 : 0.15,
      index === 34 || index === 109 ? [{ band: 'bass', time: (index + 1) / 100, strength: 0.9 }] : []))
    const result = [30, 60, 120].map(fps => {
      const mapper = new AudioResponseMapper({ version: 1, mappings: [
        { source: 'bass-level', target: 'bass', amount: 1, attack: 0.08, release: 0.3 },
        { source: 'bass-hit', target: 'size', amount: 1, attack: 0.04, release: 0.35 },
      ] })
      let next = 0
      const checkpoints = []
      for (let tick = 1; tick <= fps * 2; tick++) {
        const now = tick / fps
        const batch = []
        while (next < samples.length && samples[next].time <= now + 1e-9) batch.push(samples[next++])
        const outputs = mapper.process(batch, now)
        if (tick % (fps / 10) === 0) checkpoints.push(outputs)
      }
      return { checkpoints, events: mapper.getEvents() }
    })
    expect(result[0]).toEqual(result[1])
    expect(result[1]).toEqual(result[2])
  })

  it('separates amount from sensitivity, which belongs to hit detection', () => {
    const input = [frame(1, 0.4)]
    const normal = new AudioResponseMapper(config('bass-level', 'bass', 1, 0, 0.1, 1))
    const sensitive = new AudioResponseMapper(config('bass-level', 'bass', 1, 0, 0.1, 4))
    const larger = new AudioResponseMapper(config('bass-level', 'bass', 3, 0, 0.1, 1))
    expect(sensitive.process(input, 0.01)).toEqual(normal.process(input, 0.01))
    expect(larger.process(input, 0.01).bass).toBeCloseTo(1.2)
  })

  it('retains separate hit lifetimes and reaches attack peaks before release', () => {
    const mapper = new AudioResponseMapper(config('bass-hit', 'size', 1, 0.04, 0.03))
    mapper.process([frame(1, 0, [{ band: 'bass', time: 0.01, strength: 0.8 }])], 0.01)
    expect(mapper.process([], 0.03).size).toBeCloseTo(0.4)
    expect(mapper.process([], 0.05).size).toBeCloseTo(0.8)
    expect(mapper.process([], 0.2).size).toBeLessThan(0.01)
    mapper.process([frame(31, 0, [{ band: 'bass', time: 0.31, strength: 0.6 }])], 0.31)
    expect(mapper.process([], 0.35).size).toBeCloseTo(0.6)
    const events = mapper.getEvents()
    expect(events).toHaveLength(2)
    expect(mapper.getEvents(events[0].id)).toEqual([events[1]])
    events[0].strength = 0
    expect(mapper.getEvents()[0].strength).toBe(0.8)
  })

  it('discards duplicate frames and clears reactions across resets or long gaps', () => {
    const mapper = new AudioResponseMapper(config('bass-hit', 'audioHit', 1, 0, 0.2))
    const input = frame(1, 0, [{ band: 'bass', time: 0.01, strength: 1 }])
    mapper.process([input, input], 0.01)
    expect(mapper.getEvents()).toHaveLength(1)
    expect(mapper.process([], 2).audioHit).toBe(0)
    expect(mapper.getEvents()).toEqual([])
    mapper.process([frame(201, 0, [{ band: 'bass', time: 2.01, strength: 1 }])], 2.01)
    expect(mapper.getEvents()[0].id).toBeGreaterThan(1)
    mapper.reset()
    expect(mapper.getSnapshot()).toMatchObject({ events: [], lastTime: null, outputs: { audioHit: 0 } })
  })

  it('accepts a restarted analysis sequence at a newer time without retaining old pulses', () => {
    const mapper = new AudioResponseMapper(config('bass-hit', 'audioHit', 1, 0, 0.2))
    mapper.process([frame(4, 0, [{ band: 'bass', time: 0.04, strength: 1 }])], 0.04)
    const previousId = mapper.getEvents()[0].id
    expect(mapper.process([{ ...frame(1), time: 0.05 }], 0.05).audioHit).toBe(0)
    mapper.process([{ ...frame(2), time: 0.06, hits: [{ band: 'bass', time: 0.06, strength: 0.5 }] }], 0.06)
    expect(mapper.getEvents()).toHaveLength(1)
    expect(mapper.getEvents()[0].id).toBeGreaterThan(previousId)
  })

  it('bounds event retention and leaves unsupported configuration visible as warnings', () => {
    const mapper = new AudioResponseMapper({ version: 1, mappings: [
      { source: 'vocals', target: 'bass' }, { source: 'bass-level', target: 'unsupported' },
    ] })
    expect(mapper.warnings).toHaveLength(2)
    expect(mapper.process([frame(1, 1)], 0.01).bass).toBe(0)
    mapper.setConfig(config('bass-hit', 'audioHit'))
    for (let sequence = 1; sequence <= 200; sequence++) {
      mapper.process([frame(sequence, 0, ['bass', 'mid', 'treble', 'overall'].map(band => ({
        band: band as AudioAnalysisBand, time: sequence / 100, strength: 1,
      })))], sequence / 100)
    }
    expect(mapper.getEvents().length).toBeLessThanOrEqual(512)
    expect(mapper.setConfig({ version: 2 }).warnings).not.toHaveLength(0)
  })
})

describe('synthetic audio frames', () => {
  it('produces the same fixed-step measurements at every preview rendering rate', () => {
    const runs = [30, 60, 120].map(fps => {
      const synthetic = new SyntheticAudioFrames(731, 0.75)
      synthetic.reset(10)
      return Array.from({ length: fps * 2 }, (_, index) => synthetic.process(10 + (index + 1) / fps)).flat()
    })
    expect(runs[0]).toHaveLength(200)
    expect(runs[0]).toEqual(runs[1])
    expect(runs[1]).toEqual(runs[2])
  })

  it('uses the same mapper path for synthetic and recorded frames', () => {
    const synthetic = new SyntheticAudioFrames(44)
    synthetic.reset(0)
    const generated = synthetic.process(0.5)
    const preview = new AudioResponseMapper()
    const recorded = new AudioResponseMapper()
    expect(preview.process(generated, 0.5)).toEqual(recorded.process(structuredClone(generated), 0.5))
    expect(preview.getEvents()).toEqual(recorded.getEvents())
  })

  it('drops catch-up after suspension and never emits queued bursts on resume', () => {
    const synthetic = new SyntheticAudioFrames(3)
    synthetic.reset(0)
    expect(synthetic.process(0.1)).toHaveLength(10)
    expect(synthetic.process(5)).toEqual([])
    const resumed = synthetic.process(5.02)
    expect(resumed).toHaveLength(2)
    expect(resumed.every(sample => sample.time > 5)).toBe(true)
    expect(synthetic.process(Number.NaN)).toEqual([])
  })
})
