// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Blob as NativeBlob } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountLocalMusicCheck } from './isolated-playback-ui'
import { createTestRhythm } from './test-rhythm'
import type { createIsolatedPlayer } from '../src/modules/player/isolation/isolatedPlayer'

const disposers: Array<() => void> = []
const rendererUrl = 'http://localhost:5181/index.html'
const button = (id: string) => document.getElementById(id) as HTMLButtonElement
const image = () => document.getElementById('capture') as HTMLImageElement
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function fixture(boundary = true) {
  const player = {
    setAudioResponse: vi.fn(), setSceneSettings: vi.fn(), getAudioResponseCapabilities: vi.fn(() => null),
    ready: Promise.resolve(), loadScene: vi.fn(async () => {}), loadAudio: vi.fn<ReturnType<typeof createIsolatedPlayer>['loadAudio']>(async () => {}),
    play: vi.fn(async () => {}), pause: vi.fn(), setRenderingSuspended: vi.fn(), seek: vi.fn(), reset: vi.fn(), clearAudio: vi.fn(),
    setVolume: vi.fn(), setSynthetic: vi.fn(), getAudioState: vi.fn(() => ({ loaded: true, playing: true, time: 12, duration: 30, volume: 0.4 })),
    capture: vi.fn(async () => new Blob(['raster'], { type: 'image/png' })), dispose: vi.fn(),
  }
  const createPlayer = vi.fn<typeof createIsolatedPlayer>(() => player)
  const verifyBoundary = vi.fn(() => boundary)
  const dispose = mountLocalMusicCheck({ createPlayer, verifyBoundary })
  disposers.push(dispose)
  return { player, createPlayer, verifyBoundary, dispose, async start() {
    button('start').click()
    await vi.waitFor(() => expect(button('test-audio').disabled).toBe(false))
  } }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', true)
  vi.stubGlobal('location', new URL('http://127.0.0.1:5178/scripts/isolated-playback-check.html'))
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:test-capture'); static revokeObjectURL = vi.fn() })
  document.documentElement.innerHTML = readFileSync(resolve('scripts/isolated-playback-check.html'), 'utf8')
})
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('local music check page', () => {
  it.each(['https://mage.peterbucci.com/player-check/', 'http://127.0.0.1:5178/scripts/isolated-playback-check.html?renderer=other'])('does not create a player on an unexpected page: %s', url => {
    vi.stubGlobal('location', new URL(url))
    const f = fixture()
    button('start').click()
    expect(button('start').disabled).toBe(true)
    expect(f.createPlayer).not.toHaveBeenCalled()
    expect(document.getElementById('status')?.textContent).toContain('Run npm run manual-checks:dev')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not enable the fixture in a production build', () => {
    vi.stubEnv('DEV', false)
    const f = fixture()
    button('start').click()
    expect(f.createPlayer).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts only the fixed renderer and enables music after verifying the boundary', async () => {
    const f = fixture()
    await f.start()
    expect(f.createPlayer).toHaveBeenCalledWith(expect.objectContaining({ rendererUrl, profile: 'preview', useInlineFrameStyles: false }))
    expect(f.verifyBoundary).toHaveBeenCalledOnce()
    expect(f.player.loadScene).toHaveBeenCalledOnce()
    expect(f.player.setVolume).toHaveBeenCalledWith(0.4)
    expect(document.getElementById('boundary')?.textContent).toContain('Isolation verified')
    button('switch').click()
    await vi.waitFor(() => expect(f.player.loadScene).toHaveBeenCalledTimes(2))
    expect(f.player.loadAudio).not.toHaveBeenCalled()
    expect(f.player.pause).not.toHaveBeenCalled()
  })

  it('removes a player if isolation cannot be verified', async () => {
    const f = fixture(false)
    button('start').click()
    await vi.waitFor(() => expect(f.player.dispose).toHaveBeenCalledOnce())
    expect(button('test-audio').disabled).toBe(true)
    expect(document.getElementById('status')?.textContent).toContain('Isolation could not be verified')
  })

  it.each([['legacy', 'Original'], ['mapped-v1', 'Selective']])('keeps %s available as %s', async (mode, label) => {
    const f = fixture()
    await f.start()
    const select = document.getElementById('response') as HTMLSelectElement
    expect(select.querySelector(`option[value="${mode}"]`)?.textContent).toBe(label)
    select.value = mode
    select.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(f.player.loadScene).toHaveBeenCalledTimes(2))
    expect(f.player.loadScene).toHaveBeenLastCalledWith(expect.objectContaining({
      scene: expect.objectContaining({ audioResponse: mode }),
    }))
  })

  it('loads only local/generated blobs and preserves transport controls', async () => {
    const f = fixture()
    await f.start()
    button('test-audio').click()
    await vi.waitFor(() => expect(f.player.play).toHaveBeenCalledOnce())
    expect(f.player.loadAudio.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect((f.player.loadAudio.mock.calls[0][0] as Blob).size).toBe(44 + 22050 * 30 * 2)
    button('pause').click()
    await vi.waitFor(() => expect(button('pause').textContent).toBe('Play'))
    expect(f.player.pause).toHaveBeenCalledOnce()
    button('seek').click()
    expect(f.player.seek).toHaveBeenCalledWith(7)
    button('clear').click()
    expect(f.player.clearAudio).toHaveBeenCalledOnce()
    const file = new File(['music'], 'local.mp3', { type: 'audio/mpeg' })
    const input = document.getElementById('audio') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(f.player.loadAudio).toHaveBeenCalledWith(file))
  })

  it('drops a late capture and revokes displayed capture URLs on stop', async () => {
    const f = fixture()
    await f.start()
    button('capture-button').click()
    await vi.waitFor(() => expect(image().hidden).toBe(false))
    expect(image().getAttribute('src')).toBe('blob:test-capture')
    button('stop').click()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-capture')
    expect(image().hasAttribute('src')).toBe(false)
    await f.start()
    const capture = deferred<Blob>()
    f.player.capture.mockReturnValueOnce(capture.promise)
    button('capture-button').click()
    button('stop').click()
    capture.resolve(new Blob(['old raster']))
    await Promise.resolve()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(image().hidden).toBe(true)
  })

  it('does not restart music when its load finishes after stop and releases all page timers', async () => {
    const f = fixture()
    await f.start()
    const loaded = deferred<void>()
    f.player.loadAudio.mockReturnValueOnce(loaded.promise)
    button('test-audio').click()
    button('stop').click()
    loaded.resolve()
    await Promise.resolve()
    expect(f.player.play).not.toHaveBeenCalled()
    f.dispose()
    expect(vi.getTimerCount()).toBe(0)
    button('start').click()
    expect(f.createPlayer).toHaveBeenCalledOnce()
  })

  it('generates a bounded WAV rhythm with no network source', async () => {
    const rhythm = createTestRhythm()
    expect(rhythm.type).toBe('audio/wav')
    expect(rhythm.size).toBe(1323044)
    const bytes = new Uint8Array(await rhythm.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
  })
})
