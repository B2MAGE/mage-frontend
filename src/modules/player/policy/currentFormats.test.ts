import { describe, expect, it } from 'vitest'
import { normalizeAudioResponseConfig, normalizeAudioResponseMode } from '@shared/lib/audioResponse'
import { parseSceneImport, validateSceneForPlayback, validateSceneForStorage } from './sceneValidation'
import { resolveSceneForPlayback } from '../templates/resolveScene'
import { isAudioResponseSettings } from '../isolation/playbackProtocol'

const settings = { intent: { minimizing_factor: 0.5, power_factor: 3, base_speed: 0.1, easing_speed: 0.4 },
  state: { volume_multiplier: 0.7 }, visualizer: { shader: 'let size = input(); sphere(0.5 + size)' } }
const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.5,
  mappings: [{ target: 'size', source: 'bass-hit', amount: 0.4, attack: 0.02, release: 0.5 }] }).config
const documents = [
  { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 },
  { schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'sphere', operation: { type: 'sphere', radius: 0.5 } }] },
  { schemaVersion: 1, kind: 'custom', scene: settings },
]
const responseDocument = (document: typeof documents[number], mode: string) => document.kind === 'custom'
  ? { ...document, scene: { ...settings, audioResponse: mode, audioResponseConfig: config } }
  : { ...document, settings: { audioResponse: mode, audioResponseConfig: config } }

describe('current scene formats', () => {
  it.each(['legacy', 'mapped-v1'] as const)('preserves %s and inactive tuning through every current document kind', mode => {
    for (const document of documents) {
      const authored = responseDocument(document, mode)
      const stored = validateSceneForStorage(authored)
      const reopened = parseSceneImport(JSON.stringify(stored))
      expect(reopened).toEqual(stored)
      const resolved = resolveSceneForPlayback(validateSceneForPlayback(reopened)).engineScene
      expect(resolved.audioResponse).toBe(mode)
      expect(resolved.audioResponseConfig).toEqual(config)
      if (document.kind === 'custom') {
        expect(resolved.intent).toEqual(settings.intent)
        expect(resolved.state).toEqual(settings.state)
      }
      expect(isAudioResponseSettings({ mode, config })).toBe(true)
    }
  })

  it('retains the Original default without adding response fields to current custom documents', () => {
    expect(normalizeAudioResponseMode(undefined)).toBe('legacy')
    for (const document of documents) {
      const resolved = resolveSceneForPlayback(validateSceneForPlayback(document)).engineScene
      expect(normalizeAudioResponseMode(resolved.audioResponse)).toBe('legacy')
      if (document.kind === 'custom') expect(resolved).not.toHaveProperty('audioResponse')
    }
  })

  it('rejects abandoned audio in documents and playback messages without converting to Original', () => {
    for (const document of documents) {
      const historical = responseDocument(document, 'transient-v1')
      expect(() => validateSceneForStorage(historical)).toThrow(/unsupported/i)
      expect(() => parseSceneImport(JSON.stringify(historical))).toThrow(/unsupported/i)
      expect(() => validateSceneForPlayback(historical)).toThrow(/unsupported/i)
    }
    expect(() => normalizeAudioResponseMode('transient-v1')).toThrow('Unsupported music response version')
    expect(isAudioResponseSettings({ mode: 'transient-v1', config })).toBe(false)
  })

  it.each(['reaction-rings-v1', 'reaction-lantern-v1'])('rejects retired template %s without changing its identity', templateId => {
    const historical = { ...documents[0], templateId }
    expect(() => parseSceneImport(JSON.stringify(historical))).toThrow(/templateId/)
    expect(() => resolveSceneForPlayback(historical)).toThrow(/templateId/)
  })

  it.each([settings, { ...settings, audio: 'song.mp3' }, { ...settings, audio: { path: 'song.mp3' } },
    { ...settings, audio: { url: 'song.mp3' } }])('rejects raw transport without inserting an envelope', historical => {
    expect(() => validateSceneForStorage(historical)).toThrow('schemaVersion')
    expect(() => validateSceneForPlayback(historical)).toThrow('schemaVersion')
    expect(() => resolveSceneForPlayback(historical)).toThrow('schemaVersion')
  })

  it.each(['song.mp3', { path: 'song.mp3' }, { url: 'song.mp3' }])('rejects obsolete custom audio aliases: %j', audio => {
    expect(() => validateSceneForStorage({ schemaVersion: 1, kind: 'custom', scene: { ...settings, audio } })).toThrow('Unknown field')
  })
})
