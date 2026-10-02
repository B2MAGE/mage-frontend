export const DEFAULT_AVATAR_GRADIENT = { start: '#5c51ba', end: '#264a48' } as const

export const AVATAR_GRADIENT_PRESETS = [
  { name: 'MAGE', ...DEFAULT_AVATAR_GRADIENT },
  { name: 'Twilight', start: '#6655a4', end: '#344477' },
  { name: 'Ocean', start: '#286d9b', end: '#23494f' },
  { name: 'Forest', start: '#527b63', end: '#263e43' },
  { name: 'Ember', start: '#ab6645', end: '#663d54' },
  { name: 'Rose', start: '#a25279', end: '#4c416d' },
] as const

export function isAvatarColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function normalizeAvatarColor(value: unknown, fallback: string): string {
  return isAvatarColor(value) ? value.toLowerCase() : fallback
}

export function avatarGradientStyle(start: unknown, end: unknown) {
  const first = normalizeAvatarColor(start, DEFAULT_AVATAR_GRADIENT.start)
  const last = normalizeAvatarColor(end, DEFAULT_AVATAR_GRADIENT.end)
  return {
    backgroundImage: `linear-gradient(145deg, ${first}, ${last})`,
    color: avatarTextColor(first, last),
  }
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

// Keep initials readable when someone chooses a light custom gradient.
function avatarTextColor(start: string, end: string) {
  const values = [luminance(start), luminance(end)]
  const lightContrast = (luminance('#f4f5f7') + .05) / (Math.max(...values) + .05)
  const darkContrast = (Math.min(...values) + .05) / (luminance('#111318') + .05)
  return darkContrast > lightContrast ? '#111318' : '#f4f5f7'
}
