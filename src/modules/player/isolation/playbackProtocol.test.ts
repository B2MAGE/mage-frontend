import { describe, expect, it } from 'vitest'
import { isPlaybackMessage, playbackMessage, sceneForBridge, messageRate, type PlaybackPayloads } from './playbackProtocol'
const session = 'ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
const input: PlaybackPayloads['input'] = { time: 2, pointer: { x: 0, y: 0, down: false },
  audio: { audioTime: 2, legacyAmplitude: 0.5, playing: true, loaded: true,
    frame: { time: 2, sequence: 1, levels: { bass: 1, mid: 0, treble: 0, overall: 0.5 }, hits: [{ band: 'bass', time: 2, strength: 1 }] } } }
describe('bounded playback messages', () => {
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
    expect(sceneForBridge({ visualizer: { shader: 'sphere(0.5);' } })).toMatchObject({ kind: 'custom' })
    for (const scene of [{ visualizer: { shader: 'a'.repeat(65537) } }, { visualizer: { shader: 'sphere(1);' }, token: 'secret' },
      { visualizer: { shader: 'sphere(1);' }, audioPath: 'https://private.example/file' }]) {
      expect(() => sceneForBridge(scene)).toThrow()
      expect(isPlaybackMessage(playbackMessage('load', session, 1, 1, { scene, profile: 'preview' }), ['load'])).toBe(false)
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
