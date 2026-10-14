import { customDocument } from '@shared/test/sceneDocument'
import { describe, expect, it } from 'vitest'
import { isPlaybackMessage, playbackMessage, sceneForBridge, messageRate, type PlaybackPayloads } from './playbackProtocol'
import { extractLiveSceneSettings } from '../liveSceneSettings'
const session = 'ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
const input: PlaybackPayloads['input'] = { time: 2, pointer: { x: 0, y: 0, down: false },
  audio: { audioTime: 2, legacyAmplitude: 0.5, playing: true, loaded: true,
    frame: { time: 2, sequence: 1, levels: { bass: 1, mid: 0, treble: 0, overall: 0.5 }, hits: [{ band: 'bass', time: 2, strength: 1 }] } } }
describe('bounded playback messages', () => {
  it('negotiates startup reporting only through an exact opt-in while retaining the legacy connection', () => {
    const message = playbackMessage('connect', session, 0, 0, { startupPhases: true })
    expect(isPlaybackMessage(message, ['connect'])).toBe(true)
    expect(isPlaybackMessage({ ...message, payload: null }, ['connect'])).toBe(true)
    const getter = Object.defineProperty({}, 'startupPhases', { enumerable: true, get() { throw new Error('Must not execute') } })
    for (const payload of [{}, { startupPhases: false }, { startupPhases: 1 }, { startupPhases: true, extra: true }, getter]) {
      expect(isPlaybackMessage({ ...message, payload }, ['connect'])).toBe(false)
    }
    expect(isPlaybackMessage({ ...message, generation: 1 }, ['connect'])).toBe(false)
    expect(isPlaybackMessage({ ...message, requestId: 1 }, ['connect'])).toBe(false)
    expect(isPlaybackMessage({ ...message, type: 'ready' }, ['ready'])).toBe(false)
  })

  it('allows only a finite integer audio reset marker', () => {
    const message = playbackMessage('input', session, 1, 2, { ...input, audioEpoch: 3 })
    expect(isPlaybackMessage(message, ['input'])).toBe(true)
    for (const audioEpoch of [-1, Infinity, NaN, 0.5, '3', undefined]) {
      expect(isPlaybackMessage({ ...message, payload: { ...input, audioEpoch } }, ['input'])).toBe(false)
    }
  })

  it('accepts only bounded data-only complete live settings', () => {
    const settings = extractLiveSceneSettings(customDocument({ visualizer: { shader: 'sphere(1);' } }))
    const message = playbackMessage('scene-settings', session, 1, 2, settings)
    expect(isPlaybackMessage(message, ['scene-settings'])).toBe(true)
    const getter = { ...settings }
    Object.defineProperty(getter, 'intent', { get: () => { throw new Error('Getter must not run') } })
    for (const payload of [
      { ...settings, source: 'sphere(2);' }, { ...settings, audioPath: 'https://example.test/music' },
      { ...settings, visualizer: { ...settings.visualizer, shader: 'sphere(2);' } },
      { ...settings, state: { ...settings.state, time: 20 } },
      { ...settings, intent: { ...settings.intent, fov: Infinity } },
      { ...settings, controls: { ...settings.controls, zoom0: 1000 } },
      { ...settings, fx: { ...settings.fx, url: 'https://example.test/asset' } },
      Object.assign(Object.create({ inherited: true }), settings), getter,
    ]) expect(isPlaybackMessage({ ...message, payload }, ['scene-settings'])).toBe(false)
  })
  it('accepts bounded Builder numeric snapshots but rejects paths, duplicates and oversized values', () => {
    const settings = extractLiveSceneSettings({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'shape', operation: { type: 'sphere' } }] })
    const message = playbackMessage('scene-settings', session, 1, 2, settings)
    expect(isPlaybackMessage(message, ['scene-settings'])).toBe(true)
    for (const builderUniforms of [
      [{ objectIndex: 0, target: 'position.x', value: 101 }],
      [{ objectIndex: 0, target: 'position.x', value: 1, name: 'arbitraryUniform' }],
      [{ objectIndex: 0, target: 'visualizer.shader', value: 0 }],
      [settings.builderUniforms![0], settings.builderUniforms![0]],
    ]) expect(isPlaybackMessage({ ...message, payload: { ...settings, builderUniforms } }, ['scene-settings'])).toBe(false)
  })
  it('accepts only a fixed compile failure code without arbitrary compiler text or source', () => {
    const message = playbackMessage('error', session, 1, 2, { code: 'compile' })
    expect(message.version).toBe(2)
    expect(isPlaybackMessage(message, ['error'])).toBe(true)
    for (const payload of [{ code: 'compile', message: 'raw compiler error' },
      { code: 'compile', source: 'sphere(0.5);' }, { code: 'unknown' }]) {
      expect(isPlaybackMessage({ ...message, payload }, ['error'])).toBe(false)
    }
  })

  it('carries bounded group uniforms without permitting structural edits through the live channel', () => {
    const settings = extractLiveSceneSettings({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'shape', operation: { type: 'sphere' } }], composition: { version: 1,
        roots: ['group'], groups: [{ id: 'group', children: ['shape'], operation: { type: 'union' } }],
      } })
    const message = playbackMessage('scene-settings', session, 1, 2, settings)
    expect(isPlaybackMessage(message, ['scene-settings'])).toBe(true)
    expect(settings.builderUniforms).toContainEqual({ groupIndex: 0, target: 'scale', value: 1 })
    for (const builderUniforms of [
      [{ groupIndex: 0, target: 'children', value: 1 }],
      [{ groupIndex: 0, target: 'scale', value: 21 }],
      [{ groupIndex: 0, objectIndex: 0, target: 'position.x', value: 0 }],
    ]) expect(isPlaybackMessage({ ...message, payload: { ...settings, builderUniforms } }, ['scene-settings'])).toBe(false)
  })

  it('accepts bounded response settings and rejects code, duplicate targets, and arbitrary child capabilities', () => {
    const mapping = { target: 'size', source: 'bass-hit', amount: 1, attack: 0, release: 0.2 }
    const payload = { mode: 'mapped-v1', config: { version: 1, sensitivity: 1, mappings: [mapping] } }
    const message = { ...playbackMessage('audio-response', session, 1, 1, { mode: 'legacy', config: null }), payload }
    expect(isPlaybackMessage(message, ['audio-response'])).toBe(true)
    for (const config of [{ ...payload.config, mappings: [mapping, mapping] },
      { ...payload.config, sensitivity: 100 }, { ...payload.config, shader: 'sphere(1);' },
      { ...payload.config, mappings: [{ ...mapping, amount: Infinity }] }]) {
      expect(isPlaybackMessage({ ...message, payload: { ...payload, config } }, ['audio-response'])).toBe(false)
    }
    const response = playbackMessage('capabilities-result', session, 1, 1, { supportedTargets: ['size'] })
    expect(isPlaybackMessage(response, ['capabilities-result'])).toBe(true)
    expect(isPlaybackMessage({ ...response, payload: { supportedTargets: ['size', 'size'] } }, ['capabilities-result'])).toBe(false)
    expect(isPlaybackMessage({ ...response, payload: { supportedTargets: ['https://example.test'] } }, ['capabilities-result'])).toBe(false)
  })
  it('accepts versioned numeric input and rejects extra authority', () => {
    const message = playbackMessage('input', session, 1, 2, input)
    expect(isPlaybackMessage(message, ['input'])).toBe(true)
    for (const extra of [{ token: 'secret' }, { version: 1 }, { generation: -1 }, { requestId: Infinity }, { session: '' }]) {
      expect(isPlaybackMessage({ ...message, ...extra }, ['input'])).toBe(false)
    }
    expect(isPlaybackMessage(message, ['capture'])).toBe(false)
    expect(isPlaybackMessage({ ...message, payload: { ...input, url: 'https://example.com' } }, ['input'])).toBe(false)
  })
  it('rejects invalid audio and pointer ranges, oversize hits and future clocks', () => {
    for (const change of [{ legacyAmplitude: 2 }, { audioTime: NaN }, { audioTime: 1 }, { loaded: false },
      { frame: { ...input.audio.frame, hits: Array(17).fill(input.audio.frame!.hits[0]) } },
      { frame: { ...input.audio.frame, levels: { bass: Infinity, mid: 0, treble: 0, overall: 0 } } }]) {
      expect(isPlaybackMessage(playbackMessage('input', session, 1, 2, { ...input, audio: { ...input.audio, ...change } } as PlaybackPayloads['input']), ['input'])).toBe(false)
    }
    expect(isPlaybackMessage(playbackMessage('input', session, 1, 2, { ...input, pointer: { x: 10, y: 0, down: false } }), ['input'])).toBe(false)
  })
  it('applies shared scene policy before allowing source and rejects authority fields', () => {
    expect(sceneForBridge(customDocument({ visualizer: { shader: 'sphere(0.5);' } }))).toMatchObject({ kind: 'custom' })
    for (const scene of [{ visualizer: { shader: 'a'.repeat(65537) } }, { visualizer: { shader: 'sphere(1);' }, token: 'secret' },
      { visualizer: { shader: 'sphere(1);' }, audioPath: 'https://private.example/file' }]) {
      expect(() => sceneForBridge(customDocument(scene))).toThrow()
      expect(isPlaybackMessage(playbackMessage('load', session, 1, 1, { scene: customDocument(scene), profile: 'preview' }), ['load'])).toBe(false)
    }
  })
  it('rejects URL/SVG captures and counts a fixed bounded rate', () => {
    expect(isPlaybackMessage(playbackMessage('captured', session, 1, 2,
      { bytes: new ArrayBuffer(1048577), width: 1, height: 1, type: 'image/png' }), ['captured'])).toBe(false)
    expect(isPlaybackMessage({ ...playbackMessage('captured', session, 1, 2,
      { bytes: new ArrayBuffer(1), width: 1, height: 1, type: 'image/png' }), payload: { url: 'data:image/svg+xml,x' } }, ['captured'])).toBe(false)
    const allow = messageRate(2)
    expect([allow(0), allow(1), allow(2), allow(1000)]).toEqual([true, true, false, true])
  })
})
