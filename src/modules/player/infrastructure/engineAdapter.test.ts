import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRAND_SCENE } from '../templates/platformBrandScene'
import { sceneRecovery } from '../recovery/sceneRecovery'

const mocks = vi.hoisted(() => ({ isolated: vi.fn(), initMAGE: vi.fn(), dispose: vi.fn(), loadPreset: vi.fn(), start: vi.fn(), play: vi.fn(), pause: vi.fn() }))
vi.mock('./isolatedController', () => ({ createIsolatedMageController: mocks.isolated }))
vi.mock('@notrac/mage', () => ({ initMAGE: mocks.initMAGE }))
import { createMagePlayer } from './engineAdapter'

const template = { schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1 }
const legacy = { visualizer: { shader: 'sphere(0.5);' } }

beforeEach(() => {
  window.dispatchEvent(new PageTransitionEvent('pageshow'))
  vi.clearAllMocks()
  sceneRecovery.setSafeMode(false)
  mocks.isolated.mockResolvedValue({ dispose: vi.fn() })
  mocks.initMAGE.mockReturnValue({ ...mocks, getEngineFields: () => ({}), setInputState: vi.fn(), setSyntheticPreview: vi.fn(), getEngineTime: () => 1 })
  mocks.loadPreset.mockReturnValue({})
})

describe('createMagePlayer execution boundary', () => {
  it.each([['template', template], ['custom', { schemaVersion: 1, kind: 'custom', scene: legacy }], ['legacy', legacy]])('routes every %s scene through isolation', async (_name, scene) => {
    const target = document.createElement('div')
    await createMagePlayer(target, { initialSceneBlob: scene })
    expect(mocks.isolated).toHaveBeenCalledWith(target, { initialSceneBlob: scene })
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('never falls back to the parent when isolated startup fails', async () => {
    mocks.isolated.mockRejectedValue(new Error('Unavailable renderer'))
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: legacy })).rejects.toThrow('Unavailable renderer')
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('rejects empty controllers and invalid source before creating any renderer', async () => {
    await expect(createMagePlayer(document.createElement('div'))).rejects.toThrow(/initial scene/)
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: { ...legacy, intent: { fov: 359 } } })).rejects.toThrow(/fov/)
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: { ...template, visualizer: legacy.visualizer } })).rejects.toThrow()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
    expect(mocks.isolated).not.toHaveBeenCalled()
  })

  it.each([legacy, structuredClone(BRAND_SCENE), template])('rejects caller-supplied artwork masquerading as the platform brand', async scene => {
    await expect(createMagePlayer(document.createElement('canvas'), { platformArtwork: 'brand', initialSceneBlob: scene })).rejects.toThrow(/built-in brand/)
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('keeps the exact brand on the local engine and forbids later source replacement', async () => {
    const player = await createMagePlayer(document.createElement('canvas'), { platformArtwork: 'brand', renderProfile: 'preview' })
    expect(mocks.initMAGE).toHaveBeenCalledWith(expect.objectContaining({ renderBudget: expect.objectContaining({ maxRenderPixels: 230400 }) }))
    expect(mocks.isolated).not.toHaveBeenCalled()
    expect(() => player.loadSceneBlob(legacy)).toThrow(/separate player/)
    expect(() => player.loadSceneBlob(template)).toThrow(/separate player/)
    expect(mocks.loadPreset).not.toHaveBeenCalled()
    player.dispose()
    expect(mocks.dispose).toHaveBeenCalled()
  })

  it('rejects a saved ID or non-canvas target for the brand bypass', async () => {
    await expect(createMagePlayer(document.createElement('canvas'), { platformArtwork: 'brand', sceneKey: 4 })).rejects.toThrow(/built-in brand/)
    await expect(createMagePlayer(document.createElement('div'), { platformArtwork: 'brand' })).rejects.toThrow(/built-in brand/)
  })

  it('rejects creation during document navigation', async () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: legacy })).rejects.toThrow(/navigation/)
    expect(mocks.isolated).not.toHaveBeenCalled()
  })

  it('rejects cancelled creation before choosing either rendering path', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: legacy, signal: abort.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    await expect(createMagePlayer(document.createElement('canvas'), { platformArtwork: 'brand', signal: abort.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.isolated).not.toHaveBeenCalled()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('passes ownership cancellation to isolated creation and disposes fixed brand resources on abort', async () => {
    const abort = new AbortController(), target = document.createElement('div')
    await createMagePlayer(target, { initialSceneBlob: legacy, signal: abort.signal })
    expect(mocks.isolated).toHaveBeenCalledWith(target, { initialSceneBlob: legacy, signal: abort.signal })
    const brand = await createMagePlayer(document.createElement('canvas'), { platformArtwork: 'brand', signal: abort.signal })
    abort.abort()
    expect(mocks.dispose).toHaveBeenCalledOnce()
    brand.dispose()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
