import { describe, expect, it } from 'vitest'
import { toDegrees, toRadians } from './sceneEditor'

describe('camera angle conversion', () => {
  it.each([
    0,
    Math.PI / 7,
    Math.PI / 2,
    Math.PI,
    Math.PI * 2,
  ])('round-trips %s radians without cumulative drift', radians => {
    expect(toRadians(toDegrees(radians))).toBeCloseTo(radians, 12)
  })
})
