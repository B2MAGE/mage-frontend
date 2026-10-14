import engineSource from '@notrac/mage?raw'
import { AUDIO_RESPONSE_SIGNALS, AUDIO_RESPONSE_TARGETS, normalizeAudioResponseConfig, normalizeAudioResponseMode } from '@notrac/mage/audio-response'
import { AudioAnalysisSession } from '@notrac/mage/audio-analysis'
import { AudioResponseMapper, SyntheticAudioFrames } from '@notrac/mage/audio-mapping'
import { describe, expect, it, vi } from 'vitest'

type Harness = Record<string, unknown>
type Method = (this: Harness, ...args: unknown[]) => unknown
const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
if (engineStart < 0) throw new Error('Missing installed engine implementation.')
const engineClassSource = engineSource.slice(engineStart)

// Execute the installed implementation with fake audio resources, not a second
// implementation of the engine logic.
function engineMethod(name: string, dependencies: Record<string, unknown> = {}): Method {
  dependencies = { AUDIO_RESPONSE_SIGNALS, AUDIO_RESPONSE_TARGETS, normalizeAudioResponseConfig, normalizeAudioResponseMode, AudioAnalysisSession, AudioResponseMapper, SyntheticAudioFrames, ...dependencies }
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

function frameFixture() {
  return {
    state: { time: 1, size: 0, currAudio: 0, minimizing_factor: 0.8, power_factor: 8, base_speed: 0.12, easing_speed: 0.95, volume_multiplier: 0 },
    audioResponseMode: 'legacy',
    audio: null as { isPlaying: boolean } | null,
    reversedAudio: null,
    audioAnalyser: null as { getFrequencyData: () => Uint8Array } | null,
    previewMode: false,
    syntheticPreviewEnabled: false,
    syntheticPreviewSeed: 0,
    syntheticPreviewTempoScale: 1,
    syntheticPreviewTime: 0,
  }
}

describe('installed audio response mode integration', () => {
  it('attaches one sample-clock session and consumes all measurements between visual frames', () => {
    const analysis = { connect: vi.fn(), disconnect: vi.fn(), drain: vi.fn(() => [
      { time: 2.01, levels: { overall: 0.2 } }, { time: 2.02, levels: { overall: 0.6 } },
    ]) }
    const source = { isPlaying: true, context: { currentTime: 2.025 }, pause: vi.fn() }
    const mapper = new AudioResponseMapper({ version: 1, mappings: [{ target: 'size', source: 'overall-level', attack: 0 }] })
    const engine: Harness = {
      audioAnalysis: analysis, audio: source, isRunning: true, animationFrameId: null,
      audioMapper: mapper, syntheticAudioFrames: new SyntheticAudioFrames(),
      _resetAudioAnalysis: engineMethod('_resetAudioAnalysis'),
      _syncAudioAnalysis: engineMethod('_syncAudioAnalysis'),
    }
    const sample = engineMethod('_sampleMappedAudio')
    expect(sample.call(engine)).toMatchObject({ size: 0.6 })
    sample.call(engine)
    expect(analysis.connect).toHaveBeenCalledExactlyOnceWith(source)
    expect(analysis.drain).toHaveBeenCalledWith(2.025)
    expect(engine.audioAnalysisFrame).toEqual({ time: 2.02, levels: { overall: 0.6 } })
    engineMethod('pause').call(engine)
    expect(engine.audioAnalysisFrame).toBeNull()
    expect(engine.audioAnalysisSource).toBeNull()
  })

  it('routes synthetic and recorded measurements through the same mapper and reports unsupported targets', () => {
    const frames = [{ sequence: 1, time: 2, levels: { bass: 0.8, mid: 0.2, treble: 0.1, overall: 0.4 }, hits: [] }]
    const settings = { version: 1, mappings: [{ target: 'bass', source: 'bass-level', attack: 0 }, { target: 'size', source: 'mid-level', attack: 0 }] }
    const makeEngine = (source: 'audio' | 'synthetic'): Harness => ({
      audioMapper: new AudioResponseMapper(settings), mappedSource: source,
      audioResponseConfig: normalizeAudioResponseConfig(settings).config, audioResponseWarnings: [],
      audioResponseMode: 'mapped-v1', syntheticPreviewEnabled: true,
      audioAnalysisSource: source === 'audio' ? { context: { currentTime: 2 } } : null,
      audioAnalysis: { drain: () => frames }, syntheticAudioFrames: { process: () => frames },
      _syncAudioAnalysis: vi.fn(), visualizer: { mesh: { material: { uniforms: { bass: {}, size: {} } } } },
    })
    const clock = vi.spyOn(performance, 'now').mockReturnValue(2000)
    const sample = engineMethod('_sampleMappedAudio')
    const real = makeEngine('audio'), synthetic = makeEngine('synthetic')
    expect(sample.call(real)).toEqual(sample.call(synthetic))
    expect(engineMethod('getAudioResponseOutputs').call(real)).toMatchObject({ bass: 0.8, size: 0.2, audioTime: 2 })
    expect(engineMethod('getAudioResponseCapabilities').call(real)).toMatchObject({ supportedTargets: ['size', 'bass'], unsupportedTargets: [] })
    real.visualizer = { mesh: { material: { uniforms: { bass: {} } } } }
    expect(engineMethod('getAudioResponseCapabilities').call(real)).toMatchObject({ supportedTargets: ['bass'], unsupportedTargets: ['size'], warnings: [expect.stringContaining('size')] })
    clock.mockRestore()
  })

  it('replaces Selective settings on scene load and clears them when returning to Original', () => {
    const presetStart = engineSource.indexOf('var MAGEPreset = class MAGEPreset {')
    const presetEnd = engineSource.indexOf('\n//#endregion', presetStart)
    const Preset = new Function('normalizeAudioResponseConfig', 'normalizeAudioResponseMode', `${engineSource.slice(presetStart, presetEnd)}; return MAGEPreset;`)(normalizeAudioResponseConfig, normalizeAudioResponseMode)
    const engine: Harness = {
      setAudioResponseMode: engineMethod('setAudioResponseMode'),
      setAudioResponseConfig: engineMethod('setAudioResponseConfig'),
      getAudioResponseConfig: engineMethod('getAudioResponseConfig'),
      fx: { bleachBypassShader: { enabled: false }, toonShader: { enabled: false } },
      controls: {}, controlSettings: { active: false },
      _syncPostProcessingFromState: vi.fn(), _syncSobelResolution: vi.fn(),
    }
    const load = engineMethod('loadPreset', { MAGEPreset: Preset })
    const settings = { version: 1, sensitivity: 2, mappings: [{ target: 'bass', source: 'bass-hit', amount: 3 }] }
    load.call(engine, JSON.stringify({ audioResponse: 'mapped-v1', audioResponseConfig: settings }))
    expect(engine.audioResponseConfig).toEqual(normalizeAudioResponseConfig(settings).config)
    load.call(engine, { audioResponse: 'mapped-v1' })
    expect(engine.audioResponseConfig).toEqual(normalizeAudioResponseConfig(null).config)
    load.call(engine, {})
    expect(engine).toMatchObject({ audioResponseMode: 'legacy', audioResponseConfig: null })
  })

  it('keeps the Original audio calculation unchanged, including its existing smoothing', () => {
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
  })

})
