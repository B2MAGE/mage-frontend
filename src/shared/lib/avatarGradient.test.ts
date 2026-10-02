import { describe, expect, it } from 'vitest'
import {
  AVATAR_GRADIENT_PRESETS,
  DEFAULT_AVATAR_GRADIENT,
  avatarGradientStyle,
  isAvatarColor,
  normalizeAvatarColor,
} from './avatarGradient'

describe('avatar gradients', () => {
  it('provides six named, valid, distinct presets including the shared default', () => {
    expect(AVATAR_GRADIENT_PRESETS.map(({ name }) => name)).toEqual([
      'MAGE', 'Twilight', 'Ocean', 'Forest', 'Ember', 'Rose',
    ])
    expect(AVATAR_GRADIENT_PRESETS[0]).toMatchObject(DEFAULT_AVATAR_GRADIENT)
    expect(new Set(AVATAR_GRADIENT_PRESETS.map(({ start, end }) => `${start}:${end}`)).size).toBe(6)
    for (const { start, end } of AVATAR_GRADIENT_PRESETS) {
      expect(isAvatarColor(start)).toBe(true)
      expect(isAvatarColor(end)).toBe(true)
    }
  })

  it.each(['#000000', '#ffffff', '#Ab12Ef'])('accepts full hexadecimal color %s', (value) => {
    expect(isAvatarColor(value)).toBe(true)
    expect(normalizeAvatarColor(value, '#123456')).toBe(value.toLowerCase())
  })

  it.each([undefined, null, 123, '', '#123', '#12345678', '123456', '#12gh56', 'red', ' #123456', '#123456 ', 'url(example)'])('rejects invalid color %s and uses a safe fallback', (value) => {
    expect(isAvatarColor(value)).toBe(false)
    expect(normalizeAvatarColor(value, '#123456')).toBe('#123456')
  })

  it('falls back independently for missing or malformed saved colors', () => {
    expect(avatarGradientStyle(undefined, null)).toEqual({
      backgroundImage: 'linear-gradient(145deg, #5c51ba, #264a48)',
      color: '#f4f5f7',
    })
    expect(avatarGradientStyle('not a color', '#ABCDEF').backgroundImage).toBe(
      'linear-gradient(145deg, #5c51ba, #abcdef)',
    )
    expect(avatarGradientStyle('#123456', 'red').backgroundImage).toBe(
      'linear-gradient(145deg, #123456, #264a48)',
    )
  })

  it('keeps initials readable by choosing dark text on light colors and light text on dark colors', () => {
    expect(avatarGradientStyle('#FFFFFF', '#EEDDCC')).toEqual({
      backgroundImage: 'linear-gradient(145deg, #ffffff, #eeddcc)',
      color: '#111318',
    })
    expect(avatarGradientStyle('#000000', '#123456').color).toBe('#f4f5f7')
  })
})
