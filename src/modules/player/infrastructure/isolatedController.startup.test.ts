import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerController } from './playerController'

const mocks = vi.hoisted(() => ({ create: vi.fn(), check: vi.fn(), subscribe: vi.fn(), releaseAvailability: vi.fn(),
  subscribeRecovery: vi.fn(), releaseRecovery: vi.fn(), begin: vi.fn(), block: vi.fn() }))
vi.mock('../isolation/isolatedPlayer', () => ({ createIsolatedPlayer: mocks.create }))
vi.mock('../isolation/rendererConfig', () => ({ getIsolatedRendererUrl: () => 'https://renderer.example.net/index.html' }))
vi.mock('../availability/sceneAvailability', () => ({ sceneAvailabilityStore: {
  check: mocks.check, subscribe: mocks.subscribe,
  getSnapshot: () => ({ allowed: true, code: 'ALLOWED' }), isAllowed: () => true,
} }))
vi.mock('../recovery/sceneRecovery', async importActual => ({ ...await importActual<object>(), sceneRecovery: {
  subscribe: mocks.subscribeRecovery, begin: mocks.begin, block: mocks.block,
  isSafeMode: () => false, getBlock: () => null, getAutomaticBlock: () => null,
} }))
import { createIsolatedMageController } from './isolatedController'

const scene = { schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1 }
const controllers: MagePlayerController[] = []
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
let bridge: { ready: Promise<void>; dispose: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.check.mockResolvedValue({ allowed: true, code: 'ALLOWED' })
  mocks.subscribe.mockReturnValue(mocks.releaseAvailability)
  mocks.subscribeRecovery.mockReturnValue(mocks.releaseRecovery)
  bridge = { ready: Promise.resolve(), dispose: vi.fn() }
  mocks.create.mockReturnValue(bridge)
})
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
  vi.restoreAllMocks()
})

describe('isolated player creation cancellation', () => {
  it('allocates nothing for an already cancelled owner', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, signal: abort.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.check).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.subscribeRecovery).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('settles immediately when navigation cancels pending permission and never allocates later', async () => {
    const permission = deferred<{ allowed: boolean; code: string }>(), abort = new AbortController()
    mocks.check.mockReturnValue(permission.promise)
    const creating = createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, signal: abort.signal })
    const rejected = expect(creating).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    await rejected
    expect(mocks.releaseAvailability).toHaveBeenCalledOnce()
    expect(mocks.releaseRecovery).toHaveBeenCalledOnce()
    permission.resolve({ allowed: true, code: 'ALLOWED' }); await flush()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it('disposes a created bridge immediately when its owner leaves before readiness', async () => {
    const readiness = deferred<void>(), abort = new AbortController()
    bridge.ready = readiness.promise
    const creating = createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, signal: abort.signal })
    const rejected = expect(creating).rejects.toMatchObject({ name: 'AbortError' })
    await flush()
    expect(mocks.create).toHaveBeenCalledOnce()
    abort.abort()
    await rejected
    expect(bridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.releaseAvailability).toHaveBeenCalledOnce()
    expect(mocks.releaseRecovery).toHaveBeenCalledOnce()
    readiness.resolve(); await flush()
    expect(bridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it('retires a bridge returned after synchronous cancellation during its construction', async () => {
    const abort = new AbortController()
    mocks.create.mockImplementation(() => { abort.abort(); return bridge })
    await expect(createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, signal: abort.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(bridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it('keeps owner cancellation attached after readiness and releases it on ordinary disposal', async () => {
    const abort = new AbortController()
    const player = await createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, signal: abort.signal })
    controllers.push(player)
    abort.abort()
    expect(bridge.dispose).toHaveBeenCalledOnce()
    player.dispose()
    expect(bridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.block).not.toHaveBeenCalled()
  })
})
