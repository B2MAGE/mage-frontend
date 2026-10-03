import engineSource from '@notrac/mage?raw'
import { describe, expect, it, vi } from 'vitest'

type Engine = Record<string, unknown>
type EngineMethod = (this: Engine, ...args: unknown[]) => unknown

function method(name: string): EngineMethod {
  const start = engineSource.indexOf(`\n\t${name}(`, engineSource.indexOf('var MAGEEngine ='))
  const end = engineSource.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed lifecycle method ${name}`)
  return new Function(`return function ${engineSource.slice(start + 2, end + 3).replace(/^#/, '').replaceAll('this.#', 'this.')}`)() as EngineMethod
}

const renderStart = engineSource.indexOf('#_render = () => {')
const renderEnd = engineSource.indexOf('\n\t#_growVisualizer()', renderStart)
if (renderStart < 0 || renderEnd <= renderStart) throw new Error('Installed MAGE render loop changed')
const createRender = new Function('requestAnimationFrame', 'cancelAnimationFrame',
  `return function ${engineSource.slice(renderStart, renderEnd).replace('#_render = () =>', 'render()').replaceAll('this.#', 'this.').replace(/;\s*$/, '')}`,
) as (request: () => number, cancel: (id: number) => void) => EngineMethod

function fixture() {
  const render = vi.fn()
  const request = vi.fn(() => 27)
  const cancel = vi.fn()
  const listeners = new Set<(event: { type: string }) => void>()
  const state = { time: 10, time_multiplier: 0, size: 0, base_speed: 0, easing_speed: 0.5, volume_multiplier: 0 }
  const engine: Engine = {
    isRunning: true, isDisposed: false, scene: {}, camera: {}, renderer: { render }, composer: null,
    animationFrameId: null, state, timeIncreasing: true, audioResponseMode: 'legacy', audioAnalyser: null,
    syntheticPreviewEnabled: false, transientWasPlaying: false, previewMode: false,
    clock: { update() {}, getDelta: () => 1 / 60 }, controls: { update() {} }, viewportToast: { el: null },
    _syncViewport() {}, _updateViewportInteractionFromBridge() {}, renderLifecycleListeners: listeners,
    _notifyRenderLifecycle: method('#_notifyRenderLifecycle'),
  }
  return { engine, state, render, request, cancel, listeners, tick: () => createRender(request, cancel).call(engine) }
}

describe('installed engine render lifecycle hooks', () => {
  it('signals a submitted frame after drawing even with a frozen animation clock', () => {
    const player = fixture()
    const events = vi.fn()
    method('subscribeRenderLifecycle').call(player.engine, events)
    player.tick()
    expect(player.state.time).toBe(10)
    expect(events).toHaveBeenCalledExactlyOnceWith({ type: 'frame' })
    expect(events.mock.invocationCallOrder[0]).toBeGreaterThan(player.render.mock.invocationCallOrder[0])
  })

  it('cancels the next frame before reporting a thrown renderer failure', () => {
    const player = fixture()
    const events = vi.fn()
    method('subscribeRenderLifecycle').call(player.engine, events)
    player.render.mockImplementationOnce(() => { throw new Error('GPU program failure') })
    player.tick()
    expect(events).toHaveBeenCalledExactlyOnceWith({ type: 'error' })
    expect(player.cancel).toHaveBeenCalledExactlyOnceWith(27)
    expect(player.cancel.mock.invocationCallOrder[0]).toBeLessThan(events.mock.invocationCallOrder[0])
    expect(player.engine.isRunning).toBe(false)
    player.tick()
    expect(player.render).toHaveBeenCalledTimes(1)
    expect(player.request).toHaveBeenCalledTimes(1)
  })

  it('detaches observers and does not misclassify an observer exception as a render failure', () => {
    const player = fixture()
    const broken = vi.fn(() => { throw new Error('UI observer failed') })
    const other = vi.fn()
    const unsubscribe = method('subscribeRenderLifecycle').call(player.engine, broken) as () => void
    method('subscribeRenderLifecycle').call(player.engine, other)
    player.tick()
    expect(other).toHaveBeenCalledExactlyOnceWith({ type: 'frame' })
    unsubscribe()
    player.tick()
    expect(broken).toHaveBeenCalledTimes(1)
    expect(player.cancel).not.toHaveBeenCalled()
  })
})
