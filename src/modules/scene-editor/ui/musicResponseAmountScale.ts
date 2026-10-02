const MAX_AMOUNT = 4
const GENTLE_RATE = 0.2
const STRONG_RESPONSE_START = 0.85

function amountAt(position: number) {
  const strongProgress = Math.max(0, (position - STRONG_RESPONSE_START) / (1 - STRONG_RESPONSE_START))
  return GENTLE_RATE * position + (MAX_AMOUNT - GENTLE_RATE) * strongProgress ** 3
}

// Use most of the travel for steady, moderate changes: 0.1 at halfway, 0.17 at 85%.
// The cubic tail preserves smooth movement into stronger responses near the end.
// This changes slider travel only; saved amounts remain exact engine multipliers.
export const musicResponseAmountScale = {
  min: 0,
  max: 1,
  step: 0.001,
  toRange(amount: number) {
    if (amount <= 0) return 0
    if (amount >= MAX_AMOUNT) return 1
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const midpoint = (low + high) / 2
      if (amountAt(midpoint) < amount) low = midpoint
      else high = midpoint
    }
    return (low + high) / 2
  },
  fromRange(position: number) {
    const amount = amountAt(Math.min(1, Math.max(0, position)))
    return Math.min(MAX_AMOUNT, Math.max(0, Number(amount.toFixed(6))))
  },
}

export function formatMusicResponseAmount(value: number) {
  return String(Number(value.toPrecision(4)))
}
