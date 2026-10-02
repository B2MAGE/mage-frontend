import { describe, expect, it } from 'vitest'
import {
  AUDIO_RESPONSE_SIGNALS,
  AUDIO_RESPONSE_TARGETS,
  createDefaultAudioResponseConfig,
  normalizeAudioResponseConfig,
  normalizeAudioResponseMode,
} from '@notrac/mage/audio-response'

describe('versioned audio response configuration', () => {
  it('keeps existing and absent modes compatible, with explicit opt-in for mapped response', () => {
    expect(normalizeAudioResponseMode('legacy')).toBe('legacy')
    expect(normalizeAudioResponseMode('transient-v1')).toBe('transient-v1')
    expect(normalizeAudioResponseMode('mapped-v1')).toBe('mapped-v1')
    for (const value of [undefined, null, '', 'future-v2', {}, 1]) {
      expect(normalizeAudioResponseMode(value)).toBe('legacy')
    }
  })

  it('returns fresh complete defaults for absent or unsupported configuration', () => {
    const first = normalizeAudioResponseConfig(undefined)
    expect(first.warnings).toEqual([])
    expect(first.config.mappings.map(mapping => mapping.target)).toEqual(AUDIO_RESPONSE_TARGETS)
    expect(first.config.mappings.every(mapping => AUDIO_RESPONSE_SIGNALS.includes(mapping.source))).toBe(true)
    for (const value of [false, [], 'config', { version: 2 }, { version: 1.5 }, {}]) {
      const result = normalizeAudioResponseConfig(value)
      expect(result.config).toEqual(createDefaultAudioResponseConfig())
      expect(result.warnings.length).toBeGreaterThan(0)
    }
    first.config.mappings[0].amount = 4
    first.config.mappings.pop()
    expect(normalizeAudioResponseConfig(null).config).toEqual(createDefaultAudioResponseConfig())
  })

  it('distinguishes omitted mappings from an intentional empty mapping list', () => {
    expect(normalizeAudioResponseConfig({ version: 1 }).config.mappings).toHaveLength(6)
    expect(normalizeAudioResponseConfig({ version: 1, mappings: [] }).config.mappings).toEqual([])
    const malformed = normalizeAudioResponseConfig({ version: 1, mappings: 'invalid' })
    expect(malformed.config.mappings).toHaveLength(6)
    expect(malformed.warnings).toHaveLength(1)
  })

  it('drops unsupported mappings while retaining an independent valid bass-only mapping', () => {
    const { config, warnings } = normalizeAudioResponseConfig({
      version: 1,
      mappings: [null, { target: 'camera', source: 'bass-hit' }, { target: 'bass', source: 'vocals' }, { target: 'bass', source: 'bass-hit' }],
    })
    expect(config.mappings).toEqual([{ target: 'bass', source: 'bass-hit', amount: 1, attack: 0.04, release: 0.35 }])
    expect(warnings).toHaveLength(3)
  })

  it('bounds numeric settings and replaces non-finite values without coercion', () => {
    const result = normalizeAudioResponseConfig({
      version: 1, sensitivity: 100,
      mappings: [
        { target: 'size', source: 'bass-hit', amount: -1, attack: 100, release: 100 },
        { target: 'mid', source: 'mid-level', amount: NaN, attack: Infinity, release: '0.1' },
        { target: 'treble', source: 'treble-hit', amount: 8, attack: -1, release: -1 },
      ],
    })
    expect(result.config.sensitivity).toBe(4)
    expect(result.config.mappings).toEqual([
      { target: 'size', source: 'bass-hit', amount: 0, attack: 2, release: 5 },
      { target: 'mid', source: 'mid-level', amount: 1, attack: 0.04, release: 0.35 },
      { target: 'treble', source: 'treble-hit', amount: 4, attack: 0, release: 0 },
    ])
    expect(result.warnings).toHaveLength(10)
    expect(normalizeAudioResponseConfig({ version: 1, sensitivity: -1 }).config.sensitivity).toBe(0.1)
    expect(normalizeAudioResponseConfig({ version: 1, sensitivity: NaN }).config.sensitivity).toBe(1)
  })

  it('keeps the last valid mapping per target and does not share caller objects', () => {
    const input = { version: 1, mappings: [
      { target: 'size', source: 'bass-hit', amount: 1 },
      { target: 'size', source: 'mid-level', amount: 2 },
      { target: 'size', source: 'unsupported', amount: 3 },
    ] }
    const result = normalizeAudioResponseConfig(input)
    expect(result.config.mappings).toHaveLength(1)
    expect(result.config.mappings[0]).toMatchObject({ target: 'size', source: 'mid-level', amount: 2 })
    input.mappings[1].amount = 4
    expect(result.config.mappings[0].amount).toBe(2)
    expect(normalizeAudioResponseConfig(result.config)).toEqual({ config: result.config, warnings: [] })
  })

  it('bounds work for oversized saved configurations', () => {
    const result = normalizeAudioResponseConfig({
      version: 1,
      mappings: [...Array.from({ length: 128 }, () => ({ target: 'size', source: 'bass-hit', amount: 1 })), { target: 'size', source: 'mid-hit', amount: 2 }],
    })
    expect(result.config.mappings).toHaveLength(1)
    expect(result.config.mappings[0].source).toBe('bass-hit')
    expect(result.warnings.some(warning => warning.includes('first 128'))).toBe(true)
  })
})
