import engineSource from '@notrac/mage?raw'
import { describe, expect, it } from 'vitest'

type ClockState = { time: number; time_multiplier: number }
type ClockDirection = { increasing: boolean }
type EngineTimer = { update(): void; reset(): void; getDelta(): number }

// Exercise the installed dependency's actual clock code. The engine keeps its
// state private and constructing it requires WebGL, which jsdom cannot provide.
// Use its actual bundled Three Timer too: unlike the older Three Clock,
// getDelta() only changes after update(). Supplying fake deltas would conceal
// the missing update() call that originally left every shader's time at zero.

const renderStart = engineSource.indexOf('#_render = () => {')
const viewportSync = 'this.#_syncViewport();'
const clockStart = engineSource.indexOf(viewportSync, renderStart) + viewportSync.length
// Pointer easing moved into the input bridge in 1.0.3. Audio processing remains
// immediately after the clock and gives this extraction a stable boundary.
const clockEnd = engineSource.indexOf('let bass_input = 0;', clockStart)
const timerStart = engineSource.indexOf('var Timer = class {')
const timerEnd = engineSource.indexOf('function handleVisibilityChange()', timerStart)

if (renderStart < 0 || clockStart < renderStart || clockEnd <= clockStart || timerStart < 0 || timerEnd <= timerStart) {
  throw new Error('The MAGE render clock changed; update the dependency regression harness.')
}

const advanceClock = new Function(
  'state',
  'clock',
  'direction',
  engineSource.slice(clockStart, clockEnd)
    .replaceAll('this.#clock', 'clock')
    .replaceAll('this.#state', 'state')
    .replaceAll('this.#timeIncreasing', 'direction.increasing'),
) as (state: ClockState, clock: EngineTimer, direction: ClockDirection) => void

const createTimerClass = new Function(
  'performance',
  `${engineSource.slice(timerStart, timerEnd)}; return Timer;`,
) as (performance: { now(): number }) => new () => EngineTimer

const engineStart = engineSource.indexOf('\n\tstart() {', engineSource.indexOf('var MAGEEngine ='))
const engineFirstRender = engineSource.indexOf('this.#_render();', engineStart)
const startClockOperations = engineSource.slice(engineStart, engineFirstRender)
  .match(/this\.#clock\.[^;]+;/g) ?? []
const resumeClock = new Function(
  'clock',
  startClockOperations.join('\n').replaceAll('this.#clock', 'clock'),
) as (clock: EngineTimer) => void

function timerFixture() {
  let now = 1000
  const Timer = createTimerClass({ now: () => now })
  return {
    timer: new Timer(),
    elapse: (seconds: number) => { now += seconds * 1000 },
  }
}

describe('patched MAGE animation clock', () => {
  it.each([30, 60, 120])('accumulates elapsed time across %i frames and respects scene speed', (fps) => {
    const state = { time: 4, time_multiplier: 0.75 }
    const direction = { increasing: true }
    const { timer, elapse } = timerFixture()

    for (let frame = 0; frame < fps; frame++) {
      elapse(1 / fps)
      advanceClock(state, timer, direction)
    }

    expect(state.time).toBeCloseTo(4.75, 8)
  })

  it('limits the first frame after a suspended tab to prevent a large scene jump', () => {
    const state = { time: 12, time_multiplier: 1 }
    const { timer, elapse } = timerFixture()
    elapse(30)
    advanceClock(state, timer, { increasing: true })
    expect(state.time).toBeCloseTo(12.1, 8)
  })

  it('resets the timer on resume so paused time does not advance the scene', () => {
    const state = { time: 12, time_multiplier: 1 }
    const { timer, elapse } = timerFixture()
    elapse(30)
    resumeClock(timer)
    advanceClock(state, timer, { increasing: true })
    expect(state.time).toBe(12)
    elapse(1 / 60)
    advanceClock(state, timer, { increasing: true })
    expect(state.time).toBeCloseTo(12 + 1 / 60, 8)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'recovers from an invalid saved time and speed (%s)',
    (invalid) => {
      const state = { time: invalid, time_multiplier: invalid }
      const { timer, elapse } = timerFixture()
      elapse(1 / 60)
      advanceClock(state, timer, { increasing: true })
      expect(state.time).toBeCloseTo(1 / 60, 8)
      expect(state.time_multiplier).toBe(1)
    },
  )

  it('ignores negative elapsed time', () => {
    const state = { time: 12, time_multiplier: 1 }
    const { timer, elapse } = timerFixture()
    elapse(-1)
    advanceClock(state, timer, { increasing: true })
    expect(state.time).toBe(12)
  })
})
