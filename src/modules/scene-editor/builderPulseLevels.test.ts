import { describe, expect, it } from 'vitest'
import { AudioAnalysisKernel, type AudioAnalysisBand, type AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { createBuilderBindingController } from '../../isolated-renderer/builderBindings'
import { compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { builderUniformValues } from '../player/templates/builderUniformValues'
import { createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, defaultDriverPreset } from './builderDrivers'

const bands = ['bass', 'mid', 'treble', 'overall'] as const
const tone = (hz: number, time: number, amplitude: number) => Math.sin(2 * Math.PI * hz * time) * amplitude

function analyze(signal: (time: number) => number, sampleRate = 48000, seconds = 0.6) {
  const kernel = new AudioAnalysisKernel(sampleRate), frames: AudioAnalysisFrame[] = []
  const count = Math.round(sampleRate * seconds)
  for (let start = 0; start < count; start += 128) {
    const samples = Float32Array.from({ length: Math.min(128, count - start) }, (_, index) => signal((start + index) / sampleRate))
    frames.push(...kernel.process([samples], start / sampleRate))
  }
  return frames
}

/** Keep real PCM analysis, mapping, renderer input and the compiled Pulse expression in this regression. */
function renderLevels(frames: AudioAnalysisFrame[], amount = 2.45, offset = 0) {
  const scene = createBuilderScene(), first = scene.objects[0]
  scene.objects = bands.map(band => {
    const { driver, values } = defaultDriverPreset(first, 'pulse')
    return { ...first, id: `pulse-${band}`, drivers: [{ ...driver, expression: createDriverPresetExpression({
      ...values, source: `${band}-level`, amount, offset,
    }) }] }
  })
  const compiled = compileBuilderPreviewDocument(scene)
  const declarations = compiled.shader.match(/\blet builder_(?:driver|value)_o\d+_0_\d+=[^;]*;/g)
  expect(declarations).toHaveLength(bands.length * 2)
  // Evaluate only validated scalar declarations emitted by our trusted compiler.
  const evaluate = new Function('time', 'min', 'max', 'sin', 'cos', 'floor', ...compiled.uniforms.map(uniform => uniform.name),
    `${declarations!.join('')}return [${bands.map((_, index) =>
      `{ influence: builder_driver_o${index}_0_0, property: builder_value_o${index}_0_0 }`).join(',')}];`,
  ) as (...args: unknown[]) => { influence: number; property: number }[]
  let now = 1, uniformValues: readonly number[] = []
  const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings,
    builderUniformValues(compiled.uniforms), next => { uniformValues = next }, () => now)
  const samples = frames.map(frame => {
    now = 1 + frame.time
    controller.input({ time: now, pointer: { x: 0, y: 0, down: false, inside: false }, audio: {
      audioTime: frame.time, loaded: true, playing: true, legacyAmplitude: 0, frame,
    } })
    const values = evaluate(now, Math.min, Math.max, Math.sin, Math.cos, Math.floor, ...uniformValues)
    return Object.fromEntries(bands.map((band, index) => [band, values[index]])) as Record<AudioAnalysisBand, typeof values[number]>
  })
  controller.dispose()
  return samples
}

describe('Builder Pulse follows measured music levels', () => {
  it.each([44100, 48000])('keeps bass, mid and treble independent through PCM analysis and rendering at %s Hz', sampleRate => {
    for (const [hz, selected] of [[90, 'bass'], [700, 'mid'], [5000, 'treble']] as const) {
      const result = renderLevels(analyze(time => tone(hz, time, 0.25), sampleRate)).at(-1)!
      expect(result[selected].influence).toBeCloseTo(2.45 * 0.25 / Math.sqrt(2), 3)
      expect(result[selected].property).toBeGreaterThan(1.4)
      for (const other of ['bass', 'mid', 'treble'] as const) {
        if (other !== selected) expect(result[other].influence).toBeLessThan(result[selected].influence / 20)
      }
      expect(result.overall.influence).toBeGreaterThan(0.4)
    }
  })

  it('lets the whole mix respond to mid and treble without inventing a bass signal', () => {
    const midOnly = renderLevels(analyze(time => tone(700, time, 0.2))).at(-1)!
    const mixed = renderLevels(analyze(time => tone(700, time, 0.2) + tone(5000, time, 0.2))).at(-1)!
    expect(midOnly.bass.influence).toBe(0)
    expect(mixed.bass.influence).toBe(0)
    expect(mixed.overall.influence).toBeGreaterThan(midOnly.overall.influence * 1.4)
    expect(mixed.mid.influence).toBeCloseTo(midOnly.mid.influence, 4)
    expect(mixed.treble.influence).toBeGreaterThan(0.34)
  })

  it.each([[90, 'bass'], [700, 'mid'], [5000, 'treble']] as const)('preserves proportional response to quiet %s Hz levels', (hz, band) => {
    const strengths = [0.01, 0.03, 0.1].map(amplitude =>
      renderLevels(analyze(time => tone(hz, time, amplitude))).at(-1)![band].influence)
    expect(strengths[0]).toBeCloseTo(2.45 * 0.01 / Math.sqrt(2), 4)
    expect(strengths[1] / strengths[0]).toBeCloseTo(3, 4)
    expect(strengths[2] / strengths[0]).toBeCloseTo(10, 4)
  })

  it('retains real band differences in a bass-heavy track without normalizing quieter bands to full strength', () => {
    const result = renderLevels(analyze(time => tone(90, time, 0.4) + tone(700, time, 0.1) + tone(5000, time, 0.04))).at(-1)!
    expect(result.bass.influence).toBeCloseTo(2.45 * 0.4 / Math.sqrt(2), 3)
    expect(result.mid.influence / result.bass.influence).toBeCloseTo(0.25, 3)
    expect(result.treble.influence / result.bass.influence).toBeCloseTo(0.1, 3)
    expect(result.overall.influence).toBeGreaterThan(result.bass.influence)
  })

  it('rests during silence and safely recovers after negative level influences flatten scale', () => {
    const silence = renderLevels(analyze(() => 0))
    expect(silence.every(sample => bands.every(band => sample[band].influence === 0 && sample[band].property === 1))).toBe(true)
    const samples = renderLevels(analyze(time => time < 0.5 ? tone(90, time, 0.4) : 0, 48000, 1.5), -8, 0.5)
    expect(samples.some(sample => sample.bass.property === 0.01)).toBe(true)
    expect(samples.every(sample => bands.every(band => Number.isFinite(sample[band].property) && sample[band].property >= 0.01))).toBe(true)
    expect(samples.at(-1)!.bass.property).toBeGreaterThan(1.45)
  })
})
