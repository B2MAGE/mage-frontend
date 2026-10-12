import { describe, expect, it } from 'vitest'
import { AudioAnalysisKernel, type AudioAnalysisBand, type AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { createBuilderBindingController } from '../../isolated-renderer/builderBindings'
import { compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { builderUniformValues } from '../player/templates/builderUniformValues'
import { createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, defaultDriverPreset } from './builderDrivers'

/** Exercise the installed hit mapper, renderer input controller and real compiled expression together. */
function pulseFixture(band: AudioAnalysisBand = 'bass', amount = 3, offset = 0) {
  const scene = createBuilderScene()
  const { driver, values } = defaultDriverPreset(scene.objects[0], 'pulse')
  scene.objects[0].drivers = [{ ...driver, expression: createDriverPresetExpression({
    ...values, source: `${band}-hit`, amount, offset,
  }) }]
  const compiled = compileBuilderPreviewDocument(scene)
  const declarations = compiled.shader.match(/\blet builder_(?:driver|value)_o0_0_\d+=[^;]*;/g)
  expect(declarations).toHaveLength(2)
  // Only the trusted compiler's validated scalar declarations are evaluated here.
  const evaluate = new Function('time', 'min', 'max', 'sin', 'cos', 'floor', ...compiled.uniforms.map(uniform => uniform.name),
    `${declarations!.join('')}return { influence: builder_driver_o0_0_0, property: builder_value_o0_0_0 };`,
  ) as (...args: unknown[]) => { influence: number; property: number }
  let now = 1, sequence = 0, uniformValues: readonly number[] = []
  const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings,
    builderUniformValues(compiled.uniforms), next => { uniformValues = next }, () => now)
  const read = () => evaluate(now, Math.min, Math.max, Math.sin, Math.cos, Math.floor, ...uniformValues)
  return {
    controller, read,
    input(time: number, hits: AudioAnalysisFrame['hits'] = [], audioTime = time) {
      now = time
      controller.input({ time, pointer: { x: 0, y: 0, down: false, inside: false }, audio: {
        audioTime, loaded: true, playing: true, legacyAmplitude: 0,
        frame: { sequence: ++sequence, time: audioTime, levels: { bass: 0, mid: 0, treble: 0, overall: 0 }, hits },
      } })
      return read()
    },
    analysis(frame: AudioAnalysisFrame) {
      now = 1 + frame.time
      controller.input({ time: now, pointer: { x: 0, y: 0, down: false, inside: false }, audio: {
        audioTime: frame.time, loaded: true, playing: true, legacyAmplitude: 0, frame,
      } })
      return read()
    },
    advance(time: number) { now = time; controller.advance(); return read() },
  }
}

describe('Builder Pulse follows detected music hits', () => {
  it.each(['bass', 'mid', 'treble', 'overall'] as const)('peaks with the %s hit envelope and returns toward rest', band => {
    const f = pulseFixture(band)
    expect(f.input(1)).toEqual({ influence: 0, property: 1 })
    f.input(1.1, [{ band, time: 1.1, strength: 1 }])
    const attack = f.advance(1.125), peak = f.advance(1.15), release = f.advance(1.35)
    expect(attack.influence).toBeGreaterThan(0)
    expect(peak.influence).toBeCloseTo(3)
    expect(peak.property).toBeCloseTo(4)
    expect(peak.influence).toBeGreaterThan(attack.influence)
    expect(release.influence).toBeLessThan(peak.influence)
    expect(release.influence).toBeGreaterThan(0)
    expect(f.advance(1.95).influence).toBeLessThan(0.06)
    f.controller.dispose()
  })

  it('stays at rest during silence instead of oscillating or holding the maximum size', () => {
    const f = pulseFixture()
    for (let frame = 0; frame <= 90; frame++) {
      expect(f.input(1 + frame / 30)).toEqual({ influence: 0, property: 1 })
    }
    f.controller.dispose()
  })

  it('uses the same audio timestamps for repeated hits at 30, 60 and 120 rendered frames per second', () => {
    const checkpoints = [30, 60, 120].map(fps => {
      const f = pulseFixture()
      f.input(1)
      const events = [{ band: 'bass' as const, time: 1.1, strength: 1 }, { band: 'bass' as const, time: 1.7, strength: 0.6 }]
      let next = 0
      const results: number[] = []
      for (let frame = 1; frame <= fps; frame++) {
        const time = 1 + frame / fps
        const hits = []
        while (next < events.length && events[next].time <= time + 1e-9) hits.push(events[next++])
        const result = f.input(time, hits)
        if (frame % (fps / 10) === 0) results.push(result.influence)
      }
      // Each detected hit produces a new peak; the quieter second hit remains smaller.
      expect(results[1]).toBeGreaterThan(results[3])
      expect(results[7]).toBeGreaterThan(results[5])
      expect(results[7]).toBeLessThan(results[1])
      f.controller.dispose()
      return results
    })
    for (let index = 0; index < checkpoints[0].length; index++) {
      expect(checkpoints[0][index]).toBeCloseTo(checkpoints[1][index], 10)
      expect(checkpoints[1][index]).toBeCloseTo(checkpoints[2][index], 10)
    }
  })

  it('aligns visual peaks with actual 90 Hz bass bursts through PCM analysis and the renderer controller', () => {
    const sampleRate = 48000, duration = 3, attacks = [0.31, 0.74, 1.08]
    const kernel = new AudioAnalysisKernel(sampleRate)
    const frames: AudioAnalysisFrame[] = []
    for (let start = 0; start < sampleRate * duration; start += 128) {
      const samples = Float32Array.from({ length: Math.min(128, sampleRate * duration - start) }, (_, index) => {
        const time = (start + index) / sampleRate
        const bass = attacks.some(onset => time >= onset && time < onset + 0.07) ? 0.45 : 0
        const accompaniment = 0.07 * Math.max(0, Math.min(1, (1.4 - time) / 0.1))
        return Math.sin(2 * Math.PI * 90 * time) * bass + Math.sin(2 * Math.PI * 700 * time) * accompaniment
      })
      frames.push(...kernel.process([samples], start / sampleRate))
    }
    const hits = frames.flatMap(frame => frame.hits).filter(hit => hit.band === 'bass')
    expect(hits).toHaveLength(attacks.length)
    const f = pulseFixture()
    const samples = frames.map(frame => ({ time: frame.time, ...f.analysis(frame) }))
    const peaks = samples.filter((sample, index) => index > 0 && index < samples.length - 1
      && sample.influence > 0.1 && sample.influence > samples[index - 1].influence
      && sample.influence >= samples[index + 1].influence)
    expect(peaks).toHaveLength(attacks.length)
    peaks.forEach((peak, index) => {
      expect(peak.time).toBeGreaterThanOrEqual(attacks[index])
      expect(peak.time - attacks[index]).toBeLessThan(0.13)
      // Hit detection and the existing 50 ms attack explain the full onset-to-visual delay.
      expect(Math.abs(peak.time - hits[index].time - 0.05)).toBeLessThan(0.011)
      expect(peak.property).toBeGreaterThan(1)
      const release = samples.find(sample => sample.time >= peak.time + 0.15)!
      expect(release.influence).toBeLessThan(peak.influence)
    })
    expect(samples.filter(sample => sample.time < attacks[0]).every(sample => sample.property === 1)).toBe(true)
    expect(samples.at(-1)!.influence).toBeLessThan(0.001)
    f.controller.dispose()
  })

  it('drops the previous hit after seeking and responds to a new hit at the new audio position', () => {
    const f = pulseFixture()
    f.input(1, [{ band: 'bass', time: 1, strength: 1 }])
    expect(f.advance(1.05).influence).toBeCloseTo(3)
    expect(f.input(1.1, [], 0.2)).toEqual({ influence: 0, property: 1 })
    f.input(1.2, [{ band: 'bass', time: 0.3, strength: 0.5 }], 0.3)
    expect(f.advance(1.25).influence).toBeCloseTo(1.5)
    f.controller.dispose()
  })

  it('lets a negative beat influence shrink safely without losing its return to the original size', () => {
    const f = pulseFixture('bass', -8)
    expect(f.input(1)).toEqual({ influence: 0, property: 1 })
    f.input(1.1, [{ band: 'bass', time: 1.1, strength: 1 }])
    expect(f.advance(1.15).property).toBe(0.01)
    const recovered = f.advance(1.95)
    expect(recovered.influence).toBeLessThan(0)
    expect(recovered.property).toBeGreaterThan(0.8)
    f.controller.dispose()
  })
})
