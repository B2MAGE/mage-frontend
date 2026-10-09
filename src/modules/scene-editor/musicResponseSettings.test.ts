import { describe, expect, it } from 'vitest'
import { normalizeAudioResponseConfig } from '@shared/lib'
import { scenePlaybackIdentity } from '@modules/player'
import { createDefaultSceneData, getSceneEditorModel } from './sceneEditor'
import { buildEffectiveSceneData, readEditableSceneData } from './utils'
import { changeMusicResponseConfig, changeMusicResponseMode, readMusicResponseDefaults, restoreMusicResponseDefaults } from './musicResponseSettings'

const authoredConfig = normalizeAudioResponseConfig({
  version: 1, sensitivity: 1.7,
  mappings: [{ target: 'treble', source: 'mid-level', amount: 0, attack: 0.13, release: 0.78 }],
}).config

describe('creator music response settings', () => {
  it('opts in only after selection and preserves dormant mappings while switching modes', () => {
    const original = createDefaultSceneData()
    const originalCopy = structuredClone(original)
    const defaults = readMusicResponseDefaults(original)
    expect(defaults).not.toHaveProperty('audioResponse')
    expect(defaults).not.toHaveProperty('audioResponseConfig')
    const mapped = changeMusicResponseMode(original, 'mapped-v1', ['size'])
    expect(mapped.audioResponseConfig).toMatchObject({ mappings: [{ target: 'size', source: 'overall-hit', amount: 0.1 }] })
    expect(normalizeAudioResponseConfig(mapped.audioResponseConfig).config.mappings).toHaveLength(1)
    const edited = changeMusicResponseConfig(mapped, authoredConfig)
    const classic = changeMusicResponseMode(edited, 'legacy')
    expect(changeMusicResponseMode(classic, 'mapped-v1', ['size']).audioResponseConfig).toEqual(authoredConfig)
    expect(original).toEqual(originalCopy)
  })

  it('starts size gently while retaining other input defaults and all explicitly saved amounts', () => {
    const original = createDefaultSceneData()
    const mapped = changeMusicResponseMode(original, 'mapped-v1', ['size', 'bass'])
    expect(mapped.audioResponseConfig).toMatchObject({ mappings: [
      { target: 'size', amount: 0.1 }, { target: 'bass', amount: 1 },
    ] })
    const saved = normalizeAudioResponseConfig({ version: 1, mappings: [
      { target: 'size', source: 'overall-hit', amount: 1.23 },
    ] }).config
    expect(changeMusicResponseMode({ ...original, audioResponseConfig: saved }, 'mapped-v1').audioResponseConfig).toEqual(saved)
    expect(normalizeAudioResponseConfig(undefined).config.mappings.find(mapping => mapping.target === 'size')?.amount).toBe(1)
  })

  it.each([undefined, 'legacy', 'mapped-v1'])('restores the opening %s settings and leaves other edits intact', mode => {
    const initial = createDefaultSceneData()
    const model = getSceneEditorModel(initial)
    const original = {
      ...initial,
      ...(mode ? { audioResponse: mode, audioResponseConfig: authoredConfig } : {}),
      intent: { ...model.intent, minimizing_factor: 1.4, power_factor: 4, base_speed: 0.3, easing_speed: 0.6 },
      state: { ...model.state, volume_multiplier: 0.27 },
    }
    const defaults = readMusicResponseDefaults(original)
    const edited = {
      ...changeMusicResponseMode(original, 'mapped-v1'),
      audioResponseConfig: normalizeAudioResponseConfig({ version: 1, mappings: [] }).config,
      visualizer: { ...model.visualizer, shader: 'edited shader' },
      intent: { ...model.intent, minimizing_factor: 2, time_multiplier: 0.6 },
      state: { ...model.state, volume_multiplier: 0.8 },
      unrelated: { keep: true },
    }
    const restored = restoreMusicResponseDefaults(edited, defaults)
    expect(readMusicResponseDefaults(restored)).toEqual(defaults)
    expect(getSceneEditorModel(restored).visualizer.shader).toBe('edited shader')
    expect(getSceneEditorModel(restored).intent.time_multiplier).toBe(0.6)
    expect(restored.unrelated).toEqual({ keep: true })
    if (!mode) {
      expect(restored).not.toHaveProperty('audioResponse')
      expect(restored).not.toHaveProperty('audioResponseConfig')
    } else {
      expect(restored.audioResponseConfig).not.toBe(defaults.audioResponseConfig)
    }
  })

  it('does not change playback identity or discard classic volume when switching response modes', () => {
    const initial = createDefaultSceneData()
    initial.state = { ...getSceneEditorModel(initial).state, volume_multiplier: 0.27 }
    const baseline = buildEffectiveSceneData(initial)
    for (const mode of ['mapped-v1', 'legacy'] as const) {
      const changed = buildEffectiveSceneData(changeMusicResponseMode(readEditableSceneData(baseline), mode, ['size']))
      expect(getSceneEditorModel(readEditableSceneData(changed)).state.volume_multiplier).toBe(0.27)
      expect(scenePlaybackIdentity(changed, 'editor')).toBe(scenePlaybackIdentity(baseline, 'editor'))
    }
  })

  it('keeps an explicitly empty mapping list and zero movement strength', () => {
    const original = { ...createDefaultSceneData(), audioResponseConfig: authoredConfig }
    expect(changeMusicResponseMode(original, 'mapped-v1').audioResponseConfig).toEqual(authoredConfig)
    const disabled = changeMusicResponseConfig(original, { ...authoredConfig, mappings: [] })
    expect(changeMusicResponseMode(disabled, 'mapped-v1', ['size']).audioResponseConfig).toMatchObject({ mappings: [] })
  })
})
