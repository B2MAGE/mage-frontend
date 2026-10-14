import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRAND_SCENE } from '../templates/platformBrandScene'

const mocks = vi.hoisted(() => ({ isolated: vi.fn(), initMAGE: vi.fn() }))
vi.mock('./isolatedController', () => ({ createIsolatedMageController: mocks.isolated }))
vi.mock('@notrac/mage', () => ({ initMAGE: mocks.initMAGE }))
import { createMagePlayer } from './engineAdapter'

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const legacy = { visualizer: { shader: 'sphere(0.5);' } }
const custom = { schemaVersion: 1, kind: 'custom', scene: legacy }

beforeEach(() => {
  window.dispatchEvent(new PageTransitionEvent('pageshow'))
  vi.clearAllMocks()
  mocks.isolated.mockResolvedValue({ dispose: vi.fn() })
})

describe('createMagePlayer execution boundary', () => {
  it.each([['template', template], ['custom', custom], ['fixed artwork document', BRAND_SCENE],
    ['builder', { schemaVersion: 1, kind: 'builder', builderVersion: 1, objects: [{ id: 'sphere', operation: { type: 'sphere', radius: 0.5 } }] }]])('routes every submitted %s scene through isolation', async (_name, scene) => {
    const target = document.createElement('div')
    await createMagePlayer(target, { initialSceneBlob: scene })
    expect(mocks.isolated).toHaveBeenCalledWith(target, { initialSceneBlob: scene })
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('never falls back to the parent when isolated startup fails', async () => {
    mocks.isolated.mockRejectedValue(new Error('Unavailable renderer'))
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: custom })).rejects.toThrow('Unavailable renderer')
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('rejects historical raw scene data before allocating any renderer', async () => {
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: legacy })).rejects.toThrow('schemaVersion')
    expect(mocks.isolated).not.toHaveBeenCalled()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('rejects empty controllers and invalid source before creating any renderer', async () => {
    await expect(createMagePlayer(document.createElement('div'))).rejects.toThrow(/initial scene/)
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: { ...custom, scene: { ...legacy, intent: { fov: 359 } } } })).rejects.toThrow(/fov/)
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: { ...template, visualizer: legacy.visualizer } })).rejects.toThrow()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
    expect(mocks.isolated).not.toHaveBeenCalled()
  })

  it('cannot select a local renderer through a stale artwork option', async () => {
    const options = { platformArtwork: 'brand', initialSceneBlob: custom }
    await createMagePlayer(document.createElement('canvas'), options)
    expect(mocks.isolated).toHaveBeenCalledOnce()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('rejects creation during document navigation', async () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: custom })).rejects.toThrow(/navigation/)
    expect(mocks.isolated).not.toHaveBeenCalled()
  })

  it('rejects cancelled creation before allocating a renderer', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(createMagePlayer(document.createElement('div'), { initialSceneBlob: custom, signal: abort.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.isolated).not.toHaveBeenCalled()
    expect(mocks.initMAGE).not.toHaveBeenCalled()
  })

  it('passes ownership cancellation to isolated creation', async () => {
    const abort = new AbortController(), target = document.createElement('div')
    await createMagePlayer(target, { initialSceneBlob: custom, signal: abort.signal })
    expect(mocks.isolated).toHaveBeenCalledWith(target, { initialSceneBlob: custom, signal: abort.signal })
  })
})
