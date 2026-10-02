import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudioAnalysisKernel,
  AudioAnalysisSession,
  createAudioAnalysisWorkletSource,
  type AudioAnalysisBand,
  type AudioAnalysisFrame,
  type AudioAnalysisSource,
} from '@notrac/mage/audio-analysis'

const tone = (hz: number, time: number, amplitude = 0.25) => Math.sin(2 * Math.PI * hz * time) * amplitude

function analyze(sampleRate: number, seconds: number, signal: (time: number) => number, sensitivity = 1, stereo = false) {
  const kernel = new AudioAnalysisKernel(sampleRate, sensitivity)
  const frames: AudioAnalysisFrame[] = []
  const count = Math.round(sampleRate * seconds)
  for (let offset = 0; offset < count; offset += 128) {
    const samples = Float32Array.from({ length: Math.min(128, count - offset) }, (_, index) => signal((offset + index) / sampleRate))
    frames.push(...kernel.process(stereo ? [samples, samples.map(value => -value)] : [samples], offset / sampleRate))
  }
  return frames
}

const hitsFor = (frames: AudioAnalysisFrame[], band: AudioAnalysisBand) => frames.flatMap(frame => frame.hits).filter(hit => hit.band === band)

afterEach(() => vi.unstubAllGlobals())

describe('independent frequency signals', () => {
  it.each([44100, 48000])('classifies calibrated tones by Hertz at %s Hz', (sampleRate) => {
    for (const [hz, band] of [[90, 'bass'], [700, 'mid'], [5000, 'treble']] as const) {
      const frames = analyze(sampleRate, 0.3, time => tone(hz, time))
      const levels = frames.at(-1)!.levels
      expect(levels[band]).toBeCloseTo(0.25 / Math.sqrt(2), 2)
      for (const other of ['bass', 'mid', 'treble'] as const) {
        if (other !== band) expect(levels[other]).toBeLessThan(levels[band] / 20)
      }
      expect(frames[0].time).toBeCloseTo(0.01)
      expect(frames.at(-1)!.time).toBeCloseTo(0.3)
    }
  })

  it('preserves frequency energy in opposite-polarity stereo channels', () => {
    const mono = analyze(48000, 0.3, time => tone(90, time))
    const stereo = analyze(48000, 0.3, time => tone(90, time), 1, true)
    expect(stereo.at(-1)!.levels.bass).toBeCloseTo(mono.at(-1)!.levels.bass, 8)
    expect(stereo.at(-1)!.levels.overall).toBeCloseTo(mono.at(-1)!.levels.overall, 8)
  })

  it.each([44100, 48000])('does not repeatedly trigger on held tones, silence, or faint noise at %s Hz', (sampleRate) => {
    for (const signal of [
      () => 0,
      (time: number) => tone(90, time) + tone(700, time, 0.1) + tone(5000, time, 0.05),
      (time: number) => tone(90, time, 0.00002) + tone(5000, time, 0.00002),
      (time: number) => tone(700, time, 0.1 + 0.05 * time),
    ]) {
      const frames = analyze(sampleRate, 1, signal)
      expect(frames.flatMap(frame => frame.hits)).toEqual([])
    }
    const quiet = analyze(sampleRate, 0.3, time => tone(5000, time, 0.00002))
    expect(quiet.at(-1)!.levels.treble).toBe(0)
  })

  it.each([44100, 48000])('detects repeated bass attacks over held midrange without a shared treble cooldown at %s Hz', (sampleRate) => {
    const starts = [0.3, 0.65, 1, 1.35]
    const frames = analyze(sampleRate, 1.7, time => {
      const bassOn = starts.some(start => time >= start && time < start + 0.07)
      const trebleOn = starts.some(start => time >= start - 0.03 && time < start - 0.02)
      return tone(700, time, 0.07) + tone(90, time, bassOn ? 0.45 : 0) + tone(5000, time, trebleOn ? 0.008 : 0)
    })
    const bassHits = hitsFor(frames, 'bass')
    const trebleHits = hitsFor(frames, 'treble')
    for (const start of starts) {
      expect(bassHits.some(hit => hit.time >= start && hit.time <= start + 0.08)).toBe(true)
      expect(trebleHits.some(hit => hit.time >= start - 0.03 && hit.time <= start + 0.03)).toBe(true)
    }
    expect(bassHits).toHaveLength(starts.length)
    expect(bassHits.every(hit => hit.strength > 0 && hit.strength <= 1)).toBe(true)
    for (const frame of frames) {
      const bands = frame.hits.filter(hit => hit.band !== 'overall')
      if (bands.length) expect(frame.hits.find(hit => hit.band === 'overall')!.strength).toBe(Math.max(...bands.map(hit => hit.strength)))
      expect(frame.hits.every(hit => hit.time === frame.time)).toBe(true)
    }
  })

  it('recognizes quieter attacks above the floor without boosting quiet levels to full scale', () => {
    const signal = (time: number, scale: number) => tone(700, time, 0.07 * scale) + tone(90, time, time >= 0.3 && time < 0.37 ? 0.4 * scale : 0)
    const loud = analyze(48000, 0.6, time => signal(time, 1))
    const quiet = analyze(48000, 0.6, time => signal(time, 0.1))
    expect(hitsFor(loud, 'bass')).toHaveLength(1)
    expect(hitsFor(quiet, 'bass')).toHaveLength(1)
    expect(Math.max(...quiet.map(frame => frame.levels.bass))).toBeCloseTo(Math.max(...loud.map(frame => frame.levels.bass)) * 0.1, 4)
  })

  it('uses sensitivity for detection thresholds while leaving measured levels unchanged', () => {
    const signal = (time: number) => tone(700, time, time >= 0.3 ? 0.2 : 0.15)
    const low = analyze(48000, 0.6, signal, 0.1)
    const high = analyze(48000, 0.6, signal, 4)
    expect(low.map(frame => frame.levels)).toEqual(high.map(frame => frame.levels))
    expect(hitsFor(low, 'mid')).toHaveLength(0)
    expect(hitsFor(high, 'mid').length).toBeGreaterThan(0)
    const kernel = new AudioAnalysisKernel(48000)
    kernel.process([Float32Array.from({ length: 14400 }, (_, index) => tone(700, index / 48000))], 0)
    expect(kernel.setSensitivity(10)).toBe(4)
    const after = kernel.process([Float32Array.from({ length: 14400 }, (_, index) => tone(700, 0.3 + index / 48000))], 0.3)
    expect(after.flatMap(frame => frame.hits)).toEqual([])
    expect(kernel.setSensitivity(NaN)).toBe(1)
  })

  it('runs the complete FFT detector inside the generated worklet source', () => {
    let Processor!: new (options: unknown) => { process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean }
    const received: AudioAnalysisFrame[] = []
    class Base { port = { postMessage: (data: { frames: AudioAnalysisFrame[] }) => received.push(...data.frames) } }
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', createAudioAnalysisWorkletSource())(
      Base, (_name: string, value: typeof Processor) => { Processor = value }, 48000, 0,
    )
    const processor = new Processor({ processorOptions: { epoch: 1, sensitivity: 1 } })
    const samples = Float32Array.from({ length: 14400 }, (_, index) => tone(5000, index / 48000))
    processor.process([[samples]], [[new Float32Array(samples.length)]])
    expect(received).toHaveLength(30)
    expect(received.at(-1)!.levels.treble).toBeCloseTo(0.25 / Math.sqrt(2), 2)
    expect(received.flatMap(frame => frame.hits)).toEqual([])
  })

  it('transports live sensitivity without rebuilding or touching audible connections', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:audio-sensitivity-test')
      static revokeObjectURL = vi.fn()
    })
    const context = { currentTime: 0, destination: {}, audioWorklet: { addModule: async () => {} } }
    const output = { connect: vi.fn(), disconnect: vi.fn() }
    const node = { port: { onmessage: null, postMessage: vi.fn(), close: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
    const nodeFactory = vi.fn(() => node as unknown as AudioWorkletNode)
    const session = new AudioAnalysisSession({ nodeFactory, sensitivity: 0.5 })
    await session.connect({ context, getOutput: () => output } as unknown as AudioAnalysisSource)
    expect(session.setSensitivity(2)).toBe(2)
    expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'sensitivity', value: 2, epoch: expect.any(Number) })
    expect(nodeFactory).toHaveBeenCalledOnce()
    expect(output.disconnect).not.toHaveBeenCalled()
    session.reset()
    expect(node.port.postMessage).toHaveBeenLastCalledWith({ type: 'reset', sensitivity: 2, epoch: expect.any(Number) })
    session.dispose()
  })
})
