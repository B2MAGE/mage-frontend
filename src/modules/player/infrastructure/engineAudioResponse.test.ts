import engineSource from '@notrac/mage?raw'
import { describe, expect, it, vi } from 'vitest'

type Harness = Record<string, unknown>
type Method = (this: Harness, ...args: unknown[]) => unknown
type TransientResponse = {
  envelope: number
  age: number
  primed: boolean
  previous: Float32Array
  reset: () => void
  update: (spectrum: Float32Array | null, sampleRate: number, delta: number) => number
}

const responseStart = engineSource.indexOf('var MAGETransientAudioResponse = class {')
const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
if (responseStart < 0 || engineStart <= responseStart) throw new Error('Missing installed transient response implementation.')
const TransientAudioResponse = new Function(`${engineSource.slice(responseStart, engineStart)}; return MAGETransientAudioResponse;`)() as new () => TransientResponse
const engineClassSource = engineSource.slice(engineStart)

// Execute the installed implementation with fake audio resources, not a second
// implementation of the detector or engine logic.
function engineMethod(name: string, dependencies: Record<string, unknown> = {}): Method {
  const publicStart = engineClassSource.indexOf(`\n\t${name}(`)
  const start = publicStart >= 0 ? publicStart : engineClassSource.indexOf(`\n\t#${name}(`)
  const end = engineClassSource.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed engine method: ${name}`)
  const source = engineClassSource.slice(start + 2, end + 3).replace(/^#/, '').replaceAll('this.#', 'this.')
  return new Function(...Object.keys(dependencies), `return function ${source}`)(...Object.values(dependencies)) as Method
}

function audioFrame(): Method {
  const renderStart = engineClassSource.indexOf('#_render = () => {')
  const start = engineClassSource.indexOf('let bass_input = 0;', renderStart)
  const end = engineClassSource.indexOf('this.#controls.update();', start)
  if (start < renderStart || end <= start) throw new Error('Missing installed audio frame.')
  return new Function('delta', engineClassSource.slice(start, end).replaceAll('this.#', 'this.')) as Method
}

function spectrum(kick = false, dbOffset = 0) {
  const bins = new Float32Array(1024).fill(-Infinity)
  // Sustained accompaniment remains present even between kicks.
  bins[30] = -32 + dbOffset
  bins[44] = -36 + dbOffset
  bins[3] = (kick ? -14 : -70) + dbOffset
  bins[4] = (kick ? -20 : -70) + dbOffset
  return bins
}

function repeatedHits(dbOffset = 0, sampleRate = 48000) {
  const response = new TransientAudioResponse()
  const peaks: number[] = [], troughs: number[] = []
  for (let frame = 0; frame < 60; frame++) response.update(spectrum(false, dbOffset), sampleRate, 1 / 60)
  for (let hit = 0; hit < 8; hit++) {
    peaks.push(response.update(spectrum(true, dbOffset), sampleRate, 1 / 60))
    for (let frame = 1; frame < 36; frame++) response.update(spectrum(false, dbOffset), sampleRate, 1 / 60)
    troughs.push(response.envelope)
  }
  return { response, peaks, troughs }
}

function frameFixture() {
  return {
    state: { time: 1, size: 0, currAudio: 0, minimizing_factor: 0.8, power_factor: 8, base_speed: 0.12, easing_speed: 0.95, volume_multiplier: 0 },
    audioResponseMode: 'transient-v1',
    transientAudio: new TransientAudioResponse(),
    transientWasPlaying: false,
    audio: null as { isPlaying: boolean } | null,
    reversedAudio: null,
    audioAnalyser: null as { getFrequencyData: () => Uint8Array } | null,
    previewMode: false,
    syntheticPreviewEnabled: false,
    syntheticPreviewSeed: 0,
    syntheticPreviewTempoScale: 1,
    syntheticPreviewTime: 0,
    _sampleTransientAudio: vi.fn(() => 0.75),
    _disconnectTransientAnalyser: vi.fn(),
  }
}

describe('installed transient audio response', () => {
  it.each([44100, 48000])('keeps reacting and releasing over repeated hits with sustained accompaniment at %s Hz', (sampleRate) => {
    const { peaks, troughs } = repeatedHits(0, sampleRate)
    expect(peaks).toHaveLength(8)
    expect(peaks.every((peak) => peak > 0.5 && peak <= 1)).toBe(true)
    expect(troughs.every((value, index) => value < peaks[index] * 0.05)).toBe(true)
  })

  it('does not mistake a sustained spectrum or its first frame for ongoing beats', () => {
    const response = new TransientAudioResponse()
    const values = Array.from({ length: 180 }, () => response.update(spectrum(true), 48000, 1 / 60))
    expect(Math.max(...values)).toBe(0)
  })

  it('normalizes comparable attacks in quieter and louder recordings above the noise gate', () => {
    const loud = repeatedHits(0).peaks
    const quiet = repeatedHits(-24).peaks
    quiet.forEach((value, index) => expect(value).toBeCloseTo(loud[index], 3))
  })

  it('does not amplify near-silent changes and keeps invalid samples finite', () => {
    const response = new TransientAudioResponse()
    for (let frame = 0; frame < 180; frame++) {
      const bins = spectrum(frame % 30 === 0, -100)
      bins[4] = Number.NaN
      bins[80] = Infinity
      expect(response.update(bins, 48000, 1 / 60)).toBe(0)
    }
    for (const delta of [NaN, Infinity, -1, 0, 1 / 60]) {
      expect(Number.isFinite(response.update(null, NaN, delta))).toBe(true)
    }
  })

  it('uses elapsed time for release rather than changing speed with frame rate', () => {
    const samples = [3, 5, 10, 30, 60, 120].map((fps) => {
      const response = new TransientAudioResponse()
      response.envelope = 1
      for (let frame = 0; frame < fps; frame++) response.update(null, 48000, 1 / fps)
      return response.envelope
    })
    samples.forEach((value) => expect(value).toBeCloseTo(Math.exp(-1 / 0.16), 10))
  })

  it('clears detector history and suppresses a new track’s initial static pose on reset', () => {
    const response = repeatedHits().response
    expect(response.age).toBeGreaterThan(1)
    response.reset()
    expect(response).toMatchObject({ age: 0, envelope: 0, primed: false })
    expect(response.previous.every((value) => value === 0)).toBe(true)
    expect(response.update(spectrum(true), 48000, 1 / 60)).toBe(0)
  })
})

describe('installed audio response mode integration', () => {
  it('loads opt-in presets and defaults omitted or invalid modes to legacy without leaking state', () => {
    const presetStart = engineSource.indexOf('var MAGEPreset = class MAGEPreset {')
    const presetEnd = engineSource.indexOf('\n//#endregion', presetStart)
    const Preset = new Function(`${engineSource.slice(presetStart, presetEnd)}; return MAGEPreset;`)() as { from: (value: unknown) => unknown }
    const disconnect = vi.fn()
    const engine: Harness = {
      transientAudio: null,
      audioResponseMode: 'legacy',
      _disconnectTransientAnalyser: disconnect,
      setAudioResponseMode: engineMethod('setAudioResponseMode', { MAGETransientAudioResponse: TransientAudioResponse }),
      fx: { bleachBypassShader: { enabled: false }, toonShader: { enabled: false } },
      controls: {}, controlSettings: { active: false },
      _syncPostProcessingFromState: vi.fn(), _syncSobelResolution: vi.fn(),
    }
    const load = engineMethod('loadPreset', { MAGEPreset: Preset })
    load.call(engine, JSON.stringify({ audioResponse: 'transient-v1' }))
    expect(engine.audioResponseMode).toBe('transient-v1')
    expect(engine.transientAudio).toBeInstanceOf(TransientAudioResponse)
    load.call(engine, {})
    expect(engine).toMatchObject({ audioResponseMode: 'legacy', transientAudio: null })
    expect(disconnect).toHaveBeenCalledOnce()
    load.call(engine, { audioResponse: 'transient-v1' })
    load.call(engine, { audioResponse: 'invalid' })
    expect(engine).toMatchObject({ audioResponseMode: 'legacy', transientAudio: null })
  })

  it('gives actual audio priority over preview beats without running legacy compression again', () => {
    const engine = frameFixture()
    engine.audio = { isPlaying: true }
    engine.audioAnalyser = { getFrequencyData: vi.fn(() => new Uint8Array([0, 0, 255])) }
    engine.syntheticPreviewEnabled = true
    audioFrame().call(engine, 1 / 60)
    expect(engine._sampleTransientAudio).toHaveBeenCalledExactlyOnceWith(1 / 60)
    expect(engine.audioAnalyser.getFrequencyData).not.toHaveBeenCalled()
    expect(engine.state.currAudio).toBe(0.75)
    expect(engine.state.size).toBeCloseTo(0.756)
    expect(engine.syntheticPreviewTime).toBe(0)
  })

  it('keeps the legacy audio calculation unchanged, including its existing smoothing', () => {
    const engine = frameFixture()
    engine.audioResponseMode = 'legacy'
    engine.audio = { isPlaying: true }
    engine.audioAnalyser = { getFrequencyData: () => new Uint8Array([0, 0, 180]) }
    const { state } = engine
    const dt = 1 / 60
    const expectedAudio = Math.pow(180 / 255 * state.minimizing_factor, state.power_factor)
      + dt * state.base_speed + 0.1 * state.base_speed + dt * state.base_speed
    audioFrame().call(engine, dt)
    expect(state.currAudio).toBe(expectedAudio)
    expect(state.size).toBe((1 - state.easing_speed) * expectedAudio)
    expect(engine._sampleTransientAudio).not.toHaveBeenCalled()
  })

  it('clears stopped audio response and maintains the silent baseline', () => {
    const engine = frameFixture()
    engine.transientWasPlaying = true
    engine.state.size = 0.9
    audioFrame().call(engine, 1 / 60)
    expect(engine._disconnectTransientAnalyser).toHaveBeenCalledOnce()
    expect(engine.state).toMatchObject({ size: 0.006, currAudio: 0 })
  })

  it('runs synthetic preview when no track is playing with repeatable attack and release', () => {
    const engine = frameFixture()
    engine.syntheticPreviewEnabled = true
    const sizes: number[] = []
    for (let frame = 0; frame < 120; frame++) {
      audioFrame().call(engine, 1 / 60)
      sizes.push(engine.state.size)
    }
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.5)
    expect(sizes.every(Number.isFinite)).toBe(true)
    expect(engine._sampleTransientAudio).not.toHaveBeenCalled()
  })

  it('disconnects only the analyzer side branch and clears stale detector state', () => {
    const output = { disconnect: vi.fn() }
    const analyzer = { disconnect: vi.fn() }
    const reset = vi.fn()
    const engine: Harness = {
      transientSource: { getOutput: () => output },
      transientAnalyser: { analyser: analyzer },
      transientSpectrum: new Float32Array(1024),
      transientWasPlaying: true,
      transientAudio: { reset },
    }
    const disconnect = engineMethod('_disconnectTransientAnalyser')
    disconnect.call(engine)
    disconnect.call(engine)
    expect(output.disconnect).toHaveBeenCalledExactlyOnceWith(analyzer)
    expect(analyzer.disconnect).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledTimes(2)
    expect(engine).toMatchObject({ transientSource: null, transientAnalyser: null, transientSpectrum: null, transientWasPlaying: false })
  })

  it('uses a dedicated high-resolution analyzer with no FFT smoothing and rebinds for reversed audio', () => {
    const created: Array<{ source: unknown; fftSize: number }> = []
    const nodes: Array<{ smoothingTimeConstant: number; frequencyBinCount: number; getFloatFrequencyData: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
    class Analyzer {
      analyser = { smoothingTimeConstant: 0.8, frequencyBinCount: 1024, getFloatFrequencyData: vi.fn((bins: Float32Array) => bins.set(spectrum())), disconnect: vi.fn() }
      constructor(source: unknown, fftSize: number) {
        created.push({ source, fftSize })
        nodes.push(this.analyser)
      }
    }
    const output = { disconnect: vi.fn() }
    const audio = { isPlaying: true, context: { sampleRate: 48000, currentTime: 10 }, getOutput: () => output }
    const reverse = { ...audio, context: { sampleRate: 44100 } }
    const update = vi.fn(() => 0.6)
    const legacyAnalyzer = { fftSize: 64 }
    const engine: Harness = {
      audio, reversedAudio: reverse, isReversed: false,
      audioAnalyser: legacyAnalyzer,
      transientAudio: { reset: vi.fn(), update },
      _disconnectTransientAnalyser: engineMethod('_disconnectTransientAnalyser'),
    }
    const sample = engineMethod('_sampleTransientAudio', { AudioAnalyser: Analyzer })
    expect(sample.call(engine, 1 / 60)).toBe(0.6)
    expect(created).toEqual([{ source: audio, fftSize: 2048 }])
    expect(nodes[0].smoothingTimeConstant).toBe(0)
    expect(update).toHaveBeenLastCalledWith(expect.any(Float32Array), 48000, 1 / 60)
    audio.context.currentTime = 10.4
    sample.call(engine, 0.1)
    expect(created).toHaveLength(1)
    expect(update).toHaveBeenLastCalledWith(expect.any(Float32Array), 48000, 10.4 - 10)
    // A long background suspension re-primes the detector rather than making
    // an old spectrum look like a fresh musical attack.
    audio.context.currentTime = 13
    sample.call(engine, 0.1)
    expect(update).toHaveBeenLastCalledWith(expect.any(Float32Array), 48000, 0.1)
    expect((engine.transientAudio as { reset: ReturnType<typeof vi.fn> }).reset).toHaveBeenCalledTimes(2)
    engine.isReversed = true
    sample.call(engine, 1 / 60)
    expect(created[1]).toEqual({ source: reverse, fftSize: 2048 })
    expect(output.disconnect).toHaveBeenCalledExactlyOnceWith(nodes[0])
    expect(update).toHaveBeenLastCalledWith(expect.any(Float32Array), 44100, 1 / 60)
    expect(engine.audioAnalyser).toBe(legacyAnalyzer)
  })

  it('clears detector history when loading another track or changing playback volume', () => {
    const disconnect = vi.fn()
    class Audio {
      setVolume = vi.fn()
      setLoop = vi.fn()
    }
    const load = vi.fn()
    class Loader { load = load }
    const engine: Harness = {
      transientAudio: new TransientAudioResponse(),
      _disconnectTransientAnalyser: disconnect,
      audio: { getVolume: () => 0.5, pause: vi.fn() },
      reversedAudio: { pause: vi.fn() },
    }
    engineMethod('loadAudio', { Audio, AudioAnalyser: class {}, AudioLoader: Loader }).call(engine, 'test.mp3')
    expect(disconnect).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledWith('test.mp3', expect.any(Function), expect.any(Function), expect.any(Function))
    engineMethod('setAudioVolume').call(engine, 0.7)
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('releases detector history on seeking, unloading, and disposing', () => {
    for (const action of ['seek', 'unloadAudio', 'dispose']) {
      const disconnect = vi.fn()
      const source = { buffer: { duration: 10 }, isPlaying: false, pause: vi.fn(), setBuffer: vi.fn(), disconnect: vi.fn(), stop: vi.fn() }
      const engine: Harness = {
        transientAudio: new TransientAudioResponse(),
        _disconnectTransientAnalyser: disconnect,
        audio: source, reversedAudio: source,
        getAudioDuration: () => 10,
        isRunning: false, isDisposed: false, animationFrameId: null,
      }
      engineMethod(action).call(engine, 2)
      expect(disconnect, action).toHaveBeenCalledOnce()
    }
  })
})
