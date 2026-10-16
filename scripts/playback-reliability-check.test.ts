// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IsolatedPlayerOptions } from '../src/modules/player/isolation/isolatedPlayer'

const fake = vi.hoisted(() => ({ create: vi.fn(), boundary: vi.fn() }))
vi.mock('../src/modules/player/isolation/isolatedPlayer', () => ({ createIsolatedPlayer: fake.create }))
vi.mock('./isolated-playback-boundary', () => ({ hasVerifiedParentBoundary: fake.boundary }))
vi.mock('../src/modules/scene-editor/templateEditor', () => ({
  createTemplateScene: (templateId: string) => ({ templateId, settings: {} }),
}))

const button = (id: string) => document.getElementById(id) as HTMLButtonElement
const readReport = () => JSON.parse(document.getElementById('report')!.textContent!)
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve() }
let options: IsolatedPlayerOptions
let player: ReturnType<typeof fixture>
function fixture() {
  return { ready: Promise.resolve(), loadScene: vi.fn(async () => {}), cancelPendingScene: vi.fn(),
    loadAudio: vi.fn(async () => {}), play: vi.fn(async () => {}), pause: vi.fn(),
    setVolume: vi.fn(), setSynthetic: vi.fn(), dispose: vi.fn(),
    requestGraphicsDiagnostics: vi.fn(async () => null),
    getAudioState: vi.fn(() => ({ loaded: false, playing: false, time: 0, duration: 30 })),
    capture: vi.fn(async () => new Blob()) }
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.stubEnv('DEV', true)
  vi.stubGlobal('location', new URL('http://127.0.0.1:5178/scripts/playback-reliability-check.html'))
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  document.documentElement.innerHTML = readFileSync(resolve('scripts/playback-reliability-check.html'), 'utf8')
  fake.boundary.mockReset().mockReturnValue(true)
  player = fixture()
  fake.create.mockReset().mockImplementation((value: IsolatedPlayerOptions) => { options = value; return player })
})

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  document.body.replaceChildren()
})

describe('local playback reliability evidence', () => {
  it.each(['https://mage.peterbucci.com/scripts/playback-reliability-check.html',
    'http://127.0.0.1:5178/scripts/playback-reliability-check.html?renderer=other'])('does not start at an unapproved harness URL: %s', async url => {
    vi.stubGlobal('location', new URL(url))
    await import('./playback-reliability-check')
    button('sequential').click()
    expect(fake.create).not.toHaveBeenCalled()
    expect(button('sequential').disabled).toBe(true)
  })

  it('starts no work automatically and measures all fourteen catalog loads using one session', async () => {
    await import('./playback-reliability-check')
    expect(fake.create).not.toHaveBeenCalled()
    button('sequential').click()
    await vi.advanceTimersByTimeAsync(7000)
    expect(fake.create).toHaveBeenCalledOnce()
    expect(options.rendererUrl).toBe('http://localhost:5181/index.html')
    expect(player.loadScene).toHaveBeenCalledTimes(14)
    expect(player.dispose).not.toHaveBeenCalled()
    expect(readReport()).toMatchObject({ state: 'completed', retryRequired: 0, sessionCreates: 1, boundaryVerified: true })
    expect(readReport().loads.every((row: { outcome: string }) => row.outcome === 'loaded')).toBe(true)
  })

  it('preserves cancellation after Stop while readiness is pending', async () => {
    let ready!: () => void
    player.ready = new Promise(resolve => { ready = resolve })
    await import('./playback-reliability-check')
    button('sequential').click(); button('stop').click(); ready(); await flush()
    expect(player.dispose).toHaveBeenCalledOnce()
    expect(player.loadScene).not.toHaveBeenCalled()
    expect(readReport()).toMatchObject({ state: 'stopped', sessionDisposals: 1 })
  })

  it('records superseded burst loads as cancellation and keeps the newest successful scene', async () => {
    let rejectPrevious: ((reason: Error) => void) | null = null
    player.cancelPendingScene.mockImplementation(() => {
      rejectPrevious?.(new Error('Scene changed.')); rejectPrevious = null
    })
    player.loadScene.mockImplementationOnce(async () => {})
    player.loadScene.mockImplementation(() => new Promise<void>((resolve, reject) => {
      rejectPrevious = reject
      setTimeout(resolve, 800)
    }))
    await import('./playback-reliability-check')
    button('burst').click(); await vi.advanceTimersByTimeAsync(8000)
    const result = readReport()
    expect(result).toMatchObject({ state: 'completed', retryRequired: 0, failures: [] })
    expect(result.loads).toHaveLength(13)
    expect(result.loads.filter((row: { outcome: string }) => row.outcome === 'superseded')).toHaveLength(11)
    expect(result.loads.at(-1).outcome).toBe('loaded')
    expect(result.activeScene).toBe(result.requestedScene)
    expect(fake.create).toHaveBeenCalledOnce()
  })

  it('stops on a real session failure without counting a recovery as success or retrying automatically', async () => {
    player.loadScene.mockImplementation(async () => { options.onFailure?.('progress-timeout'); throw new Error('Stopped') })
    await import('./playback-reliability-check')
    button('sequential').click(); await vi.advanceTimersByTimeAsync(7000)
    expect(player.loadScene).toHaveBeenCalledOnce()
    expect(fake.create).toHaveBeenCalledOnce()
    expect(readReport()).toMatchObject({ state: 'failed', retryRequired: 1 })
    expect(readReport().loads[0].outcome).toBe('failed')
  })

  it('fails closed if the actual loaded frame does not satisfy the separate-site boundary', async () => {
    fake.boundary.mockReturnValue(false)
    await import('./playback-reliability-check')
    button('sequential').click(); await vi.advanceTimersByTimeAsync(7000)
    expect(player.dispose).toHaveBeenCalledOnce()
    expect(player.loadScene).toHaveBeenCalledOnce()
    expect(readReport()).toMatchObject({ state: 'failed', boundaryVerified: false, sessionDisposals: 1 })
  })

  it('bounds evidence even when a host emits many operation events', async () => {
    await import('./playback-reliability-check')
    button('sequential').click(); await flush()
    for (let index = 0; index < 600; index++) options.onDiagnostic?.({ type: 'operation', at: index,
      operation: 'capture', requestId: index, generation: 1, phase: 'failed', reason: 'timeout' })
    button('stop').click()
    expect(readReport().diagnostics).toHaveLength(512)
    expect(readReport().eventsDropped).toBe(88)
  })
})
