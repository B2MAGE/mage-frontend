import { describe, expect, it } from 'vitest'
import { boundCaptureSize, getRenderBudget } from './renderBudget'

describe('host render profiles', () => {
  it('uses the agreed full and preview ceilings', () => {
    expect(getRenderBudget()).toEqual({ maxRenderPixels: 2073600, maxLongestEdge: 1920,
      maxDevicePixelRatio: 1.5, maxFramesPerSecond: 60, maxRaymarchIterations: 200 })
    expect(getRenderBudget('preview')).toEqual({ maxRenderPixels: 230400, maxLongestEdge: 640,
      maxDevicePixelRatio: 1.5, maxFramesPerSecond: 30, maxRaymarchIterations: 200 })
    expect(Object.isFrozen(getRenderBudget())).toBe(true)
  })

  it.each([[512, 512], [10000, 5000], [390, 844], [Number.MAX_VALUE, Number.MAX_VALUE], [0, NaN]])(
    'bounds capture %s by %s without exceeding the pixel or edge budget', (width, height) => {
      const result = boundCaptureSize(width, height)
      expect(result.width * result.height).toBeLessThanOrEqual(230400)
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(640)
      expect(result.width).toBeGreaterThanOrEqual(1)
      expect(result.height).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(result.width) && Number.isInteger(result.height)).toBe(true)
    })

  it('preserves small dimensions and scales square captures to 480 pixels', () => {
    expect(boundCaptureSize(100, 80)).toEqual({ width: 100, height: 80 })
    expect(boundCaptureSize(512, 512)).toEqual({ width: 480, height: 480 })
    expect(boundCaptureSize(3840, 2160)).toEqual({ width: 640, height: 360 })
  })
})
