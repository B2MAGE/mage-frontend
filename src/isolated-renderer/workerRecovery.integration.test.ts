import { customDocument } from '@shared/test/sceneDocument'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installPlaybackRuntime } from './playbackRuntime'
import { loadPlaybackEngine } from './playbackEngine'
import { createIsolatedPlaybackHost } from '../modules/player/isolation/playbackHost'
import { createSceneRecoveryStore, sceneRecoveryKey } from '../modules/player/recovery/sceneRecovery'

const graphics = vi.hoisted(() => ({ imported: vi.fn(), initMAGE: vi.fn() }))
vi.mock('@notrac/mage', () => {
  graphics.imported()
  return { initMAGE: graphics.initMAGE }
})

// Real receiver, engine loader, child runtime, host protocol and recovery store.
// Only the browser transport and unsupported Worker environment are simulated.
class LinkedPort {
  peer!: LinkedPort
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn((data: unknown) => {
    void Promise.resolve().then(() => this.peer.onmessage?.({ data } as MessageEvent))
  })
  start = vi.fn()
  close = vi.fn(() => { this.onmessage = this.onmessageerror = null })
}
const channels: { port1: LinkedPort; port2: LinkedPort }[] = []
const releases: (() => void)[] = []
const origin = 'http://localhost:5178'
const scene = customDocument({ visualizer: { shader: 'sphere(0.5); // private submitted source' } })

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, values }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: `${origin}/` } }))
  vi.stubGlobal('Worker', undefined)
  vi.stubGlobal('MessageChannel', class {
    port1 = new LinkedPort()
    port2 = new LinkedPort()
    constructor() {
      this.port1.peer = this.port2
      this.port2.peer = this.port1
      channels.push(this)
    }
  })
  channels.length = 0
  graphics.imported.mockClear()
  graphics.initMAGE.mockClear()
})

afterEach(() => {
  releases.splice(0).forEach(release => release())
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('unavailable compiler through playback and recovery', () => {
  it.each(['missing worker', 'blocked worker constructor'] as const)('fails closed for %s and keeps the exact revision stopped until explicit retry', async unavailable => {
    const revoke = vi.fn(), allocateUrl = vi.fn(() => 'blob:fixed-compiler')
    if (unavailable === 'blocked worker constructor') {
      const NativeURL = URL
      vi.stubGlobal('URL', class extends NativeURL {
        static createObjectURL = allocateUrl
        static revokeObjectURL = revoke
      })
      vi.stubGlobal('__MAGE_COMPILER_WORKER_SOURCE__', '/* build-pinned compiler stand-in; never executed */')
      vi.stubGlobal('Worker', class {
        constructor() { throw new DOMException('Private browser policy diagnostic.', 'SecurityError') }
      })
    }
    const localStorage = memoryStorage(), sessionStorage = memoryStorage()
    const makeRecovery = (ownerId: string) => createSceneRecoveryStore({ localStorage, sessionStorage, ownerId,
      createChannel: null, listenForStorage: null })
    const recovery = makeRecovery('first-document')
    releases.push(recovery.destroy)
    const key = sceneRecoveryKey(scene, 41)!
    const lease = recovery.begin(key)!
    expect(lease).not.toBeNull()
    const onFailure = vi.fn(reason => lease.fail(reason))
    const child = Object.assign(new EventTarget(), { parent: window }) as unknown as Window
    const childContainer = document.createElement('div'), canvas = document.createElement('canvas')
    childContainer.append(canvas)
    const statusElement = document.createElement('p')
    const loadScene = vi.fn(loadPlaybackEngine)
    const runtime = installPlaybackRuntime({ canvas, statusElement, allowedParentOrigins: [origin],
      targetWindow: child, loadScene })
    releases.push(runtime.dispose)
    const container = document.createElement('div')
    document.body.append(container)
    const host = createIsolatedPlaybackHost({ container, rendererUrl: 'http://127.0.0.1:5181/', onFailure })
    releases.push(host.dispose)
    const frame = container.querySelector('iframe')!
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((...args: unknown[]) => {
      child.dispatchEvent(new MessageEvent('message', { data: args[0], origin, source: child.parent,
        ports: args[2] as MessagePort[] }))
    })
    frame.dispatchEvent(new Event('load'))
    await host.ready
    await expect(host.loadScene(scene)).rejects.toThrow('Isolated player stopped.')

    const { port1, port2 } = channels[0]
    const request = port1.postMessage.mock.calls.map(([message]) => message as { type: string; generation: number; requestId: number }).find(message => message.type === 'load')!
    const replies = port2.postMessage.mock.calls.map(([message]) => message as { type: string; generation: number; requestId: number; payload: unknown })
    expect(replies.filter(message => message.type === 'error')).toEqual([expect.objectContaining({
      generation: request.generation, requestId: request.requestId, payload: { code: 'compile' },
    })])
    expect(replies.some(message => message.type === 'loaded')).toBe(false)
    expect(loadScene).toHaveBeenCalledOnce()
    expect(loadScene.mock.calls[0][0].sceneRevision).toBe(request.generation)
    expect(loadScene.mock.calls[0][0].signal.aborted).toBe(true)
    expect(graphics.imported).not.toHaveBeenCalled()
    expect(graphics.initMAGE).not.toHaveBeenCalled()
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('compile')
    expect(frame.isConnected).toBe(false)
    expect(port1.close).toHaveBeenCalledOnce()
    expect(port2.close).toHaveBeenCalledOnce()
    expect(statusElement.textContent).toBe('This scene could not be displayed.')
    expect(allocateUrl).toHaveBeenCalledTimes(unavailable === 'blocked worker constructor' ? 1 : 0)
    expect(revoke).toHaveBeenCalledTimes(unavailable === 'blocked worker constructor' ? 1 : 0)
    expect(vi.getTimerCount()).toBe(0)
    const publicData = JSON.stringify([replies, [...localStorage.values], [...sessionStorage.values]])
    expect(publicData).not.toContain('private submitted source')
    expect(publicData).not.toContain('Private browser policy diagnostic.')

    // Failure survives another document; a single intentional retry never erases
    // the shared quarantine until the new renderer supplies healthy evidence.
    const reloaded = makeRecovery('next-document')
    releases.push(reloaded.destroy)
    expect(reloaded.getAutomaticBlock(key)?.reason).toBe('compile')
    expect(reloaded.begin(key)).toBeNull()
    reloaded.retry(key)
    const retry = reloaded.begin(key)
    expect(retry).not.toBeNull()
    expect(recovery.getAutomaticBlock(key)?.reason).toBe('compile')
    retry!.fail('compile')
    expect(reloaded.begin(key)).toBeNull()
    const nextRevision = sceneRecoveryKey(customDocument({ visualizer: { shader: 'sphere(0.6);' } }), 41)!
    expect(reloaded.getAutomaticBlock(nextRevision)).toBeNull()
    const nextLease = reloaded.begin(nextRevision)
    expect(nextLease).not.toBeNull()
    nextLease!.dispose()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(loadScene).toHaveBeenCalledOnce()
    expect(container.querySelector('iframe')).toBeNull()
  })
})
