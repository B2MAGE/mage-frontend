import engineSource from '@notrac/mage?raw'
import { AudioResponseMapper, SyntheticAudioFrames } from '@notrac/mage/audio-mapping'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Harness = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Method = (this: Harness, ...args: unknown[]) => unknown
const engineClass = engineSource.slice(engineSource.indexOf('var MAGEEngine = class MAGEEngine {'))

// Exercise the installed patch without creating a WebGL context in jsdom.
function method(name: string): Method {
  const publicStart = engineClass.indexOf(`\n\t${name}(`)
  const start = publicStart >= 0 ? publicStart : engineClass.indexOf(`\n\t#${name}(`)
  const end = engineClass.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed method ${name}`)
  return new Function(`return function ${engineClass.slice(start + 2, end + 3).replace(/^#/, '').replaceAll('this.#', 'this.')}`)() as Method
}
const renderStart = engineClass.indexOf('#_render = () => {')
const audioStart = engineClass.indexOf('let bass_input = 0;', renderStart)
const audioEnd = engineClass.indexOf('this.#controls.update();', audioStart)
const renderAudio = new Function('delta', engineClass.slice(audioStart, audioEnd).replaceAll('this.#', 'this.')) as Method
const clockStart = engineClass.indexOf('this.#clock.update();', renderStart)
const renderClock = new Function(engineClass.slice(clockStart, audioStart).replaceAll('this.#', 'this.')) as Method

function sample(time = 2, sequence = 1) {
  return { audioTime: time, loaded: true, playing: true, legacyAmplitude: 180 / 255,
    frame: { time, sequence, levels: { bass: 0.8, mid: 0.3, treble: 0.1, overall: 0.4 },
      hits: [{ band: 'bass', time, strength: 0.8 }] } }
}
function fixture() {
  const engine: Harness = {
    externalAudio: null, externalAudioFrames: [], externalAudioLastFrame: null,
    externalAudioReceivedAt: 0, externalTransientEnvelope: 0,
    externalClock: null, externalClockReceivedAt: 0,
    clock: { reset: vi.fn(), update: vi.fn(), getDelta: () => 1 / 60 },
    audioMapper: new AudioResponseMapper({ version: 1, mappings: [{ target: 'size', source: 'bass-hit', amount: 1, attack: 0, release: 0.1 }] }),
    audioAnalysis: { disconnect: vi.fn() }, audioAnalysisSource: null, audioAnalysisFrame: null,
    audioResponseMode: 'mapped-v1', mappedSource: 'none', mappedTime: 0,
    syntheticAudioFrames: new SyntheticAudioFrames(), syntheticPreviewEnabled: false,
    syntheticPreviewSeed: 0, syntheticPreviewTempoScale: 1, syntheticPreviewTime: 0,
    state: { time: 1, size: 0, currAudio: 0, minimizing_factor: 0.8, power_factor: 8, base_speed: 0.12, easing_speed: 0.95, volume_multiplier: 0 },
    audio: null, reversedAudio: null, audioAnalyser: null, isRunning: true, animationFrameId: null,
    _disconnectTransientAnalyser: vi.fn(),
  }
  for (const name of ['setExternalAudioFrame', '_externalAudioSnapshot', '_sampleExternalTransientAudio',
    '_sampleMappedAudio', '_syncAudioAnalysis', '_resetAudioAnalysis', 'getAudioAnalysis',
    'setExternalClock', '_updateExternalClock']) engine[name] = method(name)
  return engine
}
afterEach(() => { vi.restoreAllMocks() })

describe('installed external audio bridge API', () => {
  it('copies measurements, pauses renderer-owned sources and exposes no shared audio data', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture(), input = sample()
    engine.audio = { isPlaying: true, pause: vi.fn() }
    engine.setExternalAudioFrame(input)
    input.frame.levels.bass = 0
    input.frame.hits[0].strength = 0
    expect(engine.externalAudio.frame.levels.bass).toBe(0.8)
    expect(engine.externalAudio.frame.hits[0].strength).toBe(0.8)
    expect(engine.audio.pause).toHaveBeenCalledOnce()
    expect(engine.audioAnalysis.disconnect).toHaveBeenCalledOnce()
    engine._sampleMappedAudio()
    const report = engine.getAudioAnalysis()
    report.frame.levels.bass = 0
    expect(engine.audioAnalysisFrame.levels.bass).toBe(0.8)
  })

  it.each([
    { ...sample(), audioTime: NaN }, { ...sample(), legacyAmplitude: 2 },
    { ...sample(), playing: true, loaded: false }, { ...sample(), audioTime: 604801 },
    { ...sample(), sourcePath: 'blob:private-media' },
    { ...sample(), frame: { ...sample().frame, time: 3 } },
    { ...sample(), frame: { ...sample().frame, sequence: -1 } },
    { ...sample(), frame: { ...sample().frame, levels: { bass: 1, mid: 1, treble: 1, overall: Infinity } } },
    { ...sample(), frame: { ...sample().frame, hits: Array.from({ length: 17 }, () => sample().frame.hits[0]) } },
    { ...sample(), frame: { ...sample().frame, hits: [{ band: 'unknown', time: 2, strength: 1 }] } },
    { ...sample(), frame: { ...sample().frame, hits: [{ band: 'bass', time: 3, strength: 1 }] } },
    { ...sample(), frame: { ...sample().frame, hits: [{ band: 'bass', time: 0, strength: 1 }] } },
  ])('rejects malformed/out-of-range measurements without replacing the current state', input => {
    const engine = fixture()
    engine.setExternalAudioFrame(sample())
    const previous = engine.externalAudio
    expect(() => engine.setExternalAudioFrame(input)).toThrow(TypeError)
    expect(engine.externalAudio).toBe(previous)
  })

  it('rejects getters and sparse hit arrays without executing property code', () => {
    const engine = fixture(), getter = vi.fn(() => 0)
    const input = sample()
    Object.defineProperty(input, 'legacyAmplitude', { get: getter })
    expect(() => engine.setExternalAudioFrame(input)).toThrow(TypeError)
    expect(getter).not.toHaveBeenCalled()
    expect(() => engine.setExternalAudioFrame({ ...sample(), frame: { ...sample().frame, hits: new Array(2) } })).toThrow(TypeError)
  })

  it('deduplicates repeated frames and retains a bounded queue between visual frames', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.setExternalAudioFrame(sample())
    engine.setExternalAudioFrame(sample())
    expect(engine.externalAudioFrames).toHaveLength(1)
    engine._sampleMappedAudio()
    expect(engine.audioMapper.getEvents()).toHaveLength(1)
    engine.setExternalAudioFrame(sample())
    engine._sampleMappedAudio()
    expect(engine.audioMapper.getEvents()).toHaveLength(1)
    for (let index = 2; index < 42; index++) engine.setExternalAudioFrame(sample(2 + index / 100, index))
    expect(engine.externalAudioFrames).toHaveLength(32)
  })

  it('real audio wins over simulated beats and stale signals become silent', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.syntheticPreviewEnabled = true
    engine.setExternalAudioFrame(sample())
    const synthetic = vi.spyOn(engine.syntheticAudioFrames, 'process')
    expect(engine._sampleMappedAudio().size).toBeCloseTo(0.8)
    expect(synthetic).not.toHaveBeenCalled()
    clock.mockReturnValue(2101)
    expect(engine._sampleMappedAudio().size).toBe(0)
    expect(engine.mappedSource).toBe('none')
    expect(engine.getAudioAnalysis().frame).toBeNull()
    expect(synthetic).not.toHaveBeenCalled()
  })

  it('resets beat history on source detachment, backwards clock and pause', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.setExternalAudioFrame(sample())
    engine._sampleMappedAudio()
    engine.setExternalAudioFrame({ ...sample(), playing: false })
    expect(engine.audioMapper.getEvents()).toEqual([])
    expect(engine.externalAudioFrames).toEqual([])
    expect(engine._externalAudioSnapshot().audioTime).toBe(2)
    engine.setExternalAudioFrame(sample(1, 1))
    expect(engine.externalAudioFrames).toHaveLength(1)
    engine.setExternalAudioFrame(null)
    expect(engine.externalAudio).toBeNull()
    expect(engine.externalAudioFrames).toEqual([])
    expect(engine.externalAudioLastFrame).toBeNull()
  })

  it('retains the legacy response calculation using the parent frequency magnitude', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.audioResponseMode = 'legacy'
    engine.syntheticPreviewEnabled = true
    engine.setExternalAudioFrame(sample())
    const dt = 1 / 60, state = engine.state
    const expected = Math.pow(180 / 255 * state.minimizing_factor, state.power_factor)
      + dt * state.base_speed + 0.1 * state.base_speed + dt * state.base_speed
    renderAudio.call(engine, dt)
    expect(state.currAudio).toBeCloseTo(expected)
    expect(state.size).toBeCloseTo((1 - state.easing_speed) * expected)
    expect(engine.syntheticPreviewTime).toBe(0)
  })

  it('consumes each supplied transient hit once, then releases its envelope', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.audioResponseMode = 'transient-v1'
    engine.setExternalAudioFrame(sample())
    renderAudio.call(engine, 1 / 60)
    expect(engine.state.currAudio).toBe(0.8)
    engine.setExternalAudioFrame(sample())
    renderAudio.call(engine, 1 / 60)
    expect(engine.state.currAudio).toBeCloseTo(0.8 * Math.exp(-1 / 60 / 0.16))
  })

  it('does not restart a renderer-owned audio source when host playback resumes', () => {
    const engine = fixture()
    engine.setExternalAudioFrame(sample())
    engine.isAudioLoaded = vi.fn(() => true)
    engine.audio = { isPlaying: false, play: vi.fn() }
    method('play').call(engine)
    expect(engine.audio.play).not.toHaveBeenCalled()
    expect(engine.isAudioLoaded).not.toHaveBeenCalled()
  })

  it.each([0, 2])('uses the host visual clock at rate %s without advancing it a second time', rate => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.state.time_multiplier = 9 // Must have no effect while the host owns time.
    const anchor = { time: 100, rate, playing: true }
    engine.setExternalClock(anchor)
    anchor.rate = 10 // External input is copied.
    now.mockReturnValue(1050)
    renderClock.call(engine)
    expect(engine.state.time).toBeCloseTo(100 + rate * 0.05)
    now.mockReturnValue(1100)
    engine.setExternalClock({ time: 100 + rate * 0.1, rate, playing: true })
    now.mockReturnValue(1150)
    renderClock.call(engine)
    expect(engine.state.time).toBeCloseTo(100 + rate * 0.15)
  })

  it('freezes paused host time, bounds extrapolation and resumes native animation after detaching', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const engine = fixture()
    engine.setExternalClock({ time: 5, rate: 2, playing: false })
    now.mockReturnValue(2000)
    renderClock.call(engine)
    expect(engine.state.time).toBe(5)
    engine.setExternalClock({ time: 5, rate: 2, playing: true })
    now.mockReturnValue(7000)
    renderClock.call(engine)
    expect(engine.state.time).toBe(5.5)
    engine.setExternalClock(null)
    engine.state.time_multiplier = 3
    renderClock.call(engine)
    expect(engine.state.time).toBeCloseTo(5.55)
    engine.setExternalClock({ time: 604800, rate: 10, playing: true })
    now.mockReturnValue(8000)
    renderClock.call(engine)
    expect(engine.state.time).toBe(604800)
  })

  it('rejects invalid external clock ranges, extra fields and executable getters', () => {
    const engine = fixture()
    const valid = { time: 10, rate: 1, playing: true }
    engine.setExternalClock(valid)
    for (const invalid of [undefined, 5, [], { ...valid, time: NaN }, { ...valid, time: -1 },
      { ...valid, time: 604801 }, { ...valid, rate: -1 }, { ...valid, rate: 11 },
      { ...valid, rate: Infinity }, { ...valid, playing: 1 }, { ...valid, url: '/' }]) {
      expect(() => engine.setExternalClock(invalid)).toThrow(TypeError)
      expect(engine.state.time).toBe(10)
    }
    const read = vi.fn(() => 0)
    Object.defineProperty(valid, 'time', { get: read })
    expect(() => engine.setExternalClock(valid)).toThrow(TypeError)
    expect(read).not.toHaveBeenCalled()
  })
})
