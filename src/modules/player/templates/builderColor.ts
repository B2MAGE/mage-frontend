import type { BuilderColor } from './sceneContract'

/** Numeric colors are linear shader channels; hex is the same channels quantized to bytes. */
export function builderColorChannels(color: BuilderColor): [number, number, number] {
  if (typeof color !== 'string') return [color.x, color.y, color.z]
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255) as [number, number, number]
}

/** A swatch is only a display approximation until the user explicitly chooses a new color. */
export function builderColorHex(color: BuilderColor): string {
  return `#${builderColorChannels(color).map(channel => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0')).join('')}`
}
