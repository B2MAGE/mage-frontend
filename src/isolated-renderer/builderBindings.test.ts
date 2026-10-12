import { describe, expect, it, vi } from 'vitest'
import type { AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import type { BuilderBinding, BuilderSceneDocument } from '../modules/player/templates/sceneContract'
import { parseSceneDocument } from '../modules/player/templates/sceneContract'
import { compileBuilderPreviewDocument } from '../modules/player/templates/builderCompiler'
import { builderUniformValues } from '../modules/player/templates/builderUniformValues'
import type { PlaybackPayloads } from '../modules/player/isolation/playbackProtocol'
import { createBuilderBindingController } from './builderBindings'

function response(source: BuilderBinding['source'], target: BuilderBinding['target'] = 'position.x', extra: Partial<BuilderBinding> = {}): BuilderBinding {
  return { source, target, mode: 'add', amount: 1, offset: 0, attack: 0, release: 0, ...extra }
}
const silence = { audioTime: 0, frame: null, legacyAmplitude: 0, playing: false, loaded: false }
const pointer = { x: 0, y: 0, down: false, inside: false }
function fixture(bindings: BuilderBinding[][]) {
  const document = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: bindings.map((bindings, index) => ({ id: `object-${index}`, operation: { type: 'sphere' }, bindings,
      transform: { position: { x: index + 1 } } })) }) as BuilderSceneDocument
  const compiled = compileBuilderPreviewDocument(document), baseline = builderUniformValues(compiled.uniforms)
  let now = 1
  const write = vi.fn<(values: readonly number[]) => void>()
  const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings, baseline, write, () => now)
  const read = (objectIndex = 0, target: BuilderBinding['target'] = 'position.x') => {
    const index = compiled.uniforms.findIndex(uniform => 'objectIndex' in uniform && uniform.objectIndex === objectIndex && uniform.target === target)
    return write.mock.calls.at(-1)![0][index]
  }
  const input = (value: Partial<PlaybackPayloads['input']> = {}) => controller.input({ time: now, audio: silence, pointer, ...value })
  const audio = (sequence: number, levels: Partial<AudioAnalysisFrame['levels']>, hits: AudioAnalysisFrame['hits'] = []) => ({
    audioTime: now, playing: true, loaded: true, legacyAmplitude: 0,
    frame: { sequence, time: now, levels: { bass: 0, mid: 0, treble: 0, overall: 0, ...levels }, hits },
  })
  return { compiled, baseline, controller, read, write, input, audio,
    time(value: number) { now = value }, advance(value: number) { now = value; controller.advance() } }
}

describe('Builder object response controller', () => {
  it('feeds shared driver inputs from mapped music and pointer data while constants remain live', () => {
    const document = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: ['first', 'second'].map(id => ({ id, operation: { type: 'sphere' }, drivers: [
        { target: 'scale.x', mode: 'add', expression: { type: 'multiply', left: { type: 'input', source: 'bass-level' }, right: { type: 'constant', value: 0.5 } } },
        { target: 'position.x', mode: 'add', expression: { type: 'input', source: 'pointer-x' } },
      ] })),
    }) as BuilderSceneDocument
    const compiled = compileBuilderPreviewDocument(document), baseline = builderUniformValues(compiled.uniforms)
    expect(compiled.uniforms.filter(uniform => uniform.target === 'driver-signal')).toHaveLength(2)
    const write = vi.fn<(values: readonly number[]) => void>()
    let now = 1
    const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings, baseline, write, () => now)
    const read = (source: 'bass-level' | 'pointer-x') => write.mock.calls.at(-1)![0][compiled.uniforms.findIndex(uniform =>
      uniform.target === 'driver-signal' && uniform.source === source)]
    controller.input({ time: now, pointer: { x: -0.8, y: 0, down: false, inside: true }, audio: {
      ...silence, audioTime: now, playing: true, loaded: true,
      frame: { sequence: 1, time: now, levels: { bass: 0.7, mid: 0, treble: 0, overall: 0 }, hits: [] },
    } })
    now = 1.4; controller.advance()
    expect(read('bass-level')).toBeCloseTo(0.7, 2)
    expect(read('pointer-x')).toBeCloseTo(-0.8, 2)
    const envelope = read('bass-level')
    controller.configure([], baseline.map(value => value.target === 'driver-value' ? { ...value, value: 0.8 } : value))
    expect(read('bass-level')).toBeCloseTo(envelope)
    const constantIndex = compiled.uniforms.findIndex(uniform => uniform.target === 'driver-value')
    expect(write.mock.calls.at(-1)![0][constantIndex]).toBe(0.8)
    now = 2.1; controller.advance()
    expect(read('bass-level')).toBe(0)
    controller.playback(false)
    expect(read('pointer-x')).toBe(0)
    controller.dispose()
  })

  it('drives separate object properties from the same existing analysis frame', () => {
    const f = fixture([[response('bass-level')], [response('treble-level', 'scale.y', { amount: 2 })]])
    f.input({ audio: f.audio(1, { bass: 0.7, treble: 0.2 }) })
    expect(f.read()).toBeCloseTo(1.7)
    expect(f.read(1, 'scale.y')).toBeCloseTo(1.4)
    f.time(1.1); f.input({ audio: f.audio(2, { bass: 0.1, treble: 0.8 }) })
    expect(f.read()).toBeCloseTo(1.1)
    expect(f.read(1, 'scale.y')).toBeCloseTo(2.6)
  })

  it('applies signed amounts, offsets, replacement and property bounds', () => {
    const f = fixture([[response('bass-level', 'position.x', { amount: -4, offset: 0.5 }),
      response('bass-level', 'scale.x', { mode: 'replace', amount: -4 }),
      response('bass-level', 'material.metalness', { mode: 'replace', offset: 0.5, amount: 4 })]])
    f.input({ audio: f.audio(1, { bass: 1 }) })
    expect(f.read()).toBe(-2.5)
    expect(f.read(0, 'scale.x')).toBe(0.01)
    expect(f.read(0, 'material.metalness')).toBe(1)
  })

  it('keeps authored baselines and active envelopes while amount/base edits apply', () => {
    const f = fixture([[response('bass-level', 'position.x', { attack: 0.1 })]])
    f.input({ audio: f.audio(1, { bass: 1 }) }); f.advance(1.2)
    const envelope = f.read() - 1
    const next = f.baseline.map(value => 'objectIndex' in value && value.target === 'position.x' ? { ...value, value: 3 } : value)
    f.controller.configure(f.compiled.bindings.map(binding => ({ ...binding, amount: 2 })), next)
    expect(f.read()).toBeCloseTo(3 + envelope * 2)
    f.controller.configure(f.compiled.bindings.map(binding => ({ ...binding, amount: 2 })), next)
    expect(f.read()).toBeCloseTo(3 + envelope * 2)
    f.controller.configure([], next)
    expect(f.read()).toBe(3)
  })

  it('changes signal without retaining the old signal envelope', () => {
    const f = fixture([[response('bass-level')]])
    f.input({ audio: f.audio(1, { bass: 1, treble: 0.2 }) })
    f.controller.configure(f.compiled.bindings.map(binding => ({ ...binding, source: 'treble-level' })), f.baseline)
    expect(f.read()).toBe(1)
    f.time(1.04); f.input({ audio: f.audio(2, { bass: 1, treble: 0.2 }) })
    expect(f.read()).toBeCloseTo(1.2)
  })

  it('uses render-rate independent attack and release from the installed mapper', () => {
    const results = [30, 60, 120].map(fps => {
      const f = fixture([[response('bass-level', 'position.x', { attack: 0.08, release: 0.2 })]])
      f.input({ audio: f.audio(1, { bass: 1 }) })
      for (let index = 1; index <= fps / 2; index++) f.advance(1 + index / fps)
      const high = f.read()
      f.input({ audio: f.audio(2, {}) })
      for (let index = 1; index <= fps / 2; index++) f.advance(1.5 + index / fps)
      return [high, f.read()]
    })
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2])
  })

  it('does not replay duplicate hit frames and clears pulses across pause, seek and silence', () => {
    const f = fixture([[response('bass-hit', 'position.x', { release: 0.4 })]])
    const hit = f.audio(1, {}, [{ band: 'bass', time: 1, strength: 1 }])
    f.input({ audio: hit }); expect(f.read()).toBe(2)
    f.advance(1.2); const decayed = f.read()
    f.input({ audio: { ...hit, audioTime: 1.2 } }); expect(f.read()).toBeCloseTo(decayed)
    f.controller.playback(false); expect(f.read()).toBe(1)
    f.controller.playback(true); expect(f.read()).toBe(1)
    f.time(1.3); f.input({ audio: f.audio(2, {}, [{ band: 'bass', time: 1.3, strength: 1 }]) })
    expect(f.read()).toBe(2)
    f.time(1.4); f.input({ audio: f.audio(3, {}), audioEpoch: 1 })
    expect(f.read()).toBe(1)
    f.input(); expect(f.read()).toBe(1)
  })

  it('drops stale real audio without substituting a simulated beat while the track is playing', () => {
    const f = fixture([[response('bass-level')]])
    f.controller.synthetic({ enabled: true, seed: 1, tempoScale: 1 })
    f.input({ audio: f.audio(1, { bass: 1 }) }); expect(f.read()).toBe(2)
    f.advance(2.01); expect(f.read()).toBe(1)
  })

  it('does not reset an envelope when bridge latency puts a fresh sample behind the projected clock', () => {
    const f = fixture([[response('bass-hit', 'position.x', { release: 0.4 })]])
    f.input({ audio: f.audio(1, {}, [{ band: 'bass', time: 1, strength: 1 }]) })
    f.advance(1.1)
    const before = f.read()
    f.time(1.11)
    f.input({ audio: { ...f.audio(2, {}), audioTime: 1.08, frame: { ...f.audio(2, {}).frame, time: 1.08 } } })
    expect(f.read()).toBeCloseTo(before)
    f.advance(1.2)
    expect(f.read()).toBeGreaterThan(1)
    expect(f.read()).toBeLessThan(before)
  })

  it('uses signed pointer axes, releases outside the canvas and clears a held press on pause', () => {
    const f = fixture([[response('pointer-x'), response('pointer-down', 'scale.x')]])
    f.input({ pointer: { x: -0.8, y: 0.4, down: true, inside: true } })
    expect(f.read()).toBeCloseTo(0.2); expect(f.read(0, 'scale.x')).toBe(2)
    f.input({ pointer: { x: -0.8, y: 0.4, down: true, inside: false } })
    expect(f.read()).toBe(1); expect(f.read(0, 'scale.x')).toBe(1)
    f.input({ pointer: { x: 0.8, y: 0.4, down: true, inside: true } })
    f.controller.playback(false)
    expect(f.read()).toBe(1); expect(f.read(0, 'scale.x')).toBe(1)
    f.controller.playback(true)
    expect(f.read()).toBe(1); expect(f.read(0, 'scale.x')).toBe(1)
  })

  it('smooths pointer movement and its return to rest', () => {
    const f = fixture([[response('pointer-y', 'position.x', { attack: 0.1, release: 0.2 })]])
    f.input({ pointer: { x: 0, y: -1, down: false, inside: true } }); f.advance(1.1)
    const moved = f.read(); expect(moved).toBeGreaterThan(0); expect(moved).toBeLessThan(1)
    f.input({ pointer: { x: 0, y: -1, down: false, inside: false } }); f.advance(1.2)
    expect(f.read()).toBeGreaterThan(moved); expect(f.read()).toBeLessThan(1)
  })

  it('reuses deterministic synthetic frames for all bindings and gives real music priority', () => {
    const run = (fps: number) => {
      const f = fixture([[response('bass-level')], [response('bass-level')]])
      f.controller.synthetic({ enabled: true, seed: 42, tempoScale: 0.75 })
      for (let index = 1; index <= fps / 2; index++) f.advance(1 + index / fps)
      expect(f.read(0) - 1).toBeCloseTo(f.read(1) - 2)
      const simulated = f.read()
      f.input({ audio: f.audio(1, { bass: 0.2 }) }); expect(f.read()).toBeCloseTo(1.2)
      f.controller.synthetic({ enabled: false, seed: 42, tempoScale: 0.75 }); f.input()
      expect(f.read()).toBe(1)
      return simulated
    }
    expect(run(30)).toBeCloseTo(run(120))
  })

  it('validates a whole configuration before mutation and stops writes after disposal', () => {
    const f = fixture([[response('pointer-x')]])
    f.input({ pointer: { x: 0.4, y: 0, down: false, inside: true } })
    expect(() => f.controller.configure([{ ...f.compiled.bindings[0], objectIndex: 4 }], f.baseline)).toThrow()
    expect(f.read()).toBeCloseTo(1.4)
    f.controller.dispose(); f.write.mockClear(); f.advance(1.1); f.input(); f.controller.configure([], f.baseline)
    expect(f.write).not.toHaveBeenCalled()
  })
})
