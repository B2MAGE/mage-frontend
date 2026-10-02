import { describe, expect, it } from 'vitest'
import { formatMusicResponseAmount, musicResponseAmountScale as scale } from './musicResponseAmountScale'

describe('music response amount slider scale', () => {
  it('reaches useful response amounts early while keeping gentle adjustments, zero, and full strength available', () => {
    expect(scale.fromRange(0)).toBe(0)
    expect(scale.fromRange(1)).toBe(4)
    expect(scale.fromRange(0.25)).toBe(0.05)
    expect(scale.fromRange(0.5)).toBe(0.1)
    expect(scale.fromRange(0.75)).toBe(0.15)
    expect(scale.fromRange(0.85)).toBe(0.17)
    expect(scale.toRange(0.025)).toBeCloseTo(0.125, 6)
    expect(scale.toRange(0.1)).toBeCloseTo(0.5, 6)
    expect(scale.toRange(0.01)).toBeLessThan(0.1)
    expect(scale.toRange(4)).toBe(1)
    expect(scale.toRange(0)).toBe(0)
  })

  it('keeps steady small adjustments through the moderate range and joins the stronger range smoothly', () => {
    for (let step = 1; step <= 850; step += 1) {
      expect(scale.fromRange(step / 1000) - scale.fromRange((step - 1) / 1000)).toBeCloseTo(0.0002, 6)
    }
    const beforeJoin = scale.fromRange(0.85) - scale.fromRange(0.849)
    const afterJoin = scale.fromRange(0.851) - scale.fromRange(0.85)
    expect(afterJoin / beforeJoin).toBeGreaterThanOrEqual(1)
    expect(afterJoin / beforeJoin).toBeLessThan(1.02)
  })

  it('provides distinct increasing steps and can represent existing amounts without losing its full range', () => {
    const amounts = Array.from({ length: 1001 }, (_, index) => scale.fromRange(index / 1000))
    expect(new Set(amounts).size).toBe(amounts.length)
    expect(amounts.every((amount, index) => index === 0 || amount > amounts[index - 1])).toBe(true)
    for (const amount of [0, 0.000008, 0.0001, 0.003, 0.05, 0.1, 1, 2.4, 4]) {
      expect(scale.fromRange(scale.toRange(amount))).toBeCloseTo(amount, 6)
    }
    expect(scale.fromRange(-1)).toBe(0)
    expect(scale.fromRange(2)).toBe(4)
  })

  it('does not display a positive amount as zero', () => {
    expect(formatMusicResponseAmount(0)).toBe('0')
    for (const amount of [0.00000000001, 0.000008, 0.0001, 0.003, 0.05, 0.1, 4]) {
      expect(Number(formatMusicResponseAmount(amount))).toBeGreaterThan(0)
    }
  })
})
