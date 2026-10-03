import { initMAGE } from '@notrac/mage'
import engineSource from '@notrac/mage?raw'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Budget = { maxRenderPixels: number; maxLongestEdge: number; maxDevicePixelRatio: number; maxFramesPerSecond: number; maxRaymarchIterations: number }
// Installed JavaScript internals have no public declarations. Only this test
// harness exposes the private fields, with WebGL resources replaced by spies.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Engine = Record<string, any>
type Method = (this: Engine, ...args: any[]) => any
const full: Budget = { maxRenderPixels: 2073600, maxLongestEdge: 1920, maxDevicePixelRatio: 1.5, maxFramesPerSecond: 60, maxRaymarchIterations: 200 }
const preview = { ...full, maxRenderPixels: 230400, maxLongestEdge: 640, maxFramesPerSecond: 30 }
const helpersStart = engineSource.indexOf('var MAGE_RENDER_BUDGET =')
const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
if (helpersStart < 0 || engineStart < helpersStart) throw new Error('Missing installed render budget helpers')
const helpers = new Function(`${engineSource.slice(helpersStart, engineStart)}; return { normalizeMageRenderBudget, fitMageRenderDimensions, mageCaptureDimensions, mageCaptureSettleFrames, MAGE_PREVIEW_BUDGET };`)() as {
  normalizeMageRenderBudget(value?: unknown): Budget
  fitMageRenderDimensions(width: number, height: number, budget: Budget): { width: number; height: number }
  mageCaptureDimensions(width: number, height: number): { width: number; height: number }
  mageCaptureSettleFrames(value: number): number
  MAGE_PREVIEW_BUDGET: Budget
}
function method(name: string, dependencies: Engine = {}): Method {
  const start = engineSource.indexOf(`\n\t${name}(`, engineStart)
  const end = engineSource.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed method ${name}`)
  const source = engineSource.slice(start + 2, end + 3).replace(/^static /, '').replace(/^(async )?#/, '$1').replaceAll('.#', '.')
  const context = { ...helpers, ...dependencies }
  return new Function(...Object.keys(context), `return ${source.startsWith('async ') ? 'async function ' + source.slice(6) : 'function ' + source}`)(...Object.values(context)) as Method
}

function viewportFixture(budget: Budget = full) {
  const canvas = document.createElement('canvas')
  const allocations: Array<{ width: number; height: number }> = []
  let cssSize = { width: 3840, height: 2160 }
  const composerSize = { width: 1, height: 1, ratio: 1 }
  const allocated = (width: number, height: number) => allocations.push({ width, height })
  const engine: Engine = {
    renderBudget: budget, pixelRatio: null, isLowQualityMode: false,
    viewportWidth: 0, viewportHeight: 0, viewportPixelRatio: 0,
    camera: { updateProjectionMatrix: vi.fn() },
    renderer: {
      domElement: canvas,
      setDrawingBufferSize: vi.fn((width: number, height: number, ratio: number) => {
        canvas.width = Math.floor(width * ratio)
        canvas.height = Math.floor(height * ratio)
        allocated(canvas.width, canvas.height)
      }),
    },
    composer: {
      setSize: (width: number, height: number) => {
        composerSize.width = width
        composerSize.height = height
        allocated(width * composerSize.ratio, height * composerSize.ratio)
      },
      setPixelRatio: (ratio: number) => {
        composerSize.ratio = ratio
        allocated(composerSize.width * ratio, composerSize.height * ratio)
      },
    },
    renderTarget: { setSize: allocated },
    _getViewportSize: () => cssSize,
    _syncSobelResolution: vi.fn(),
  }
  engine._syncViewport = method('#_syncViewport')
  return { engine, canvas, allocations, resize: (width: number, height: number) => { cssSize = { width, height } } }
}
function expectBounded(dimensions: { width: number; height: number }, budget: Budget) {
  expect(Number.isFinite(dimensions.width)).toBe(true)
  expect(Number.isFinite(dimensions.height)).toBe(true)
  expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(budget.maxLongestEdge + 1e-8)
  expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(budget.maxRenderPixels + 1e-8)
}
afterEach(() => vi.restoreAllMocks())

describe('installed MAGE render ceilings', () => {
  it('defaults to policy ceilings and cannot be raised by configuration', () => {
    expect(helpers.normalizeMageRenderBudget()).toEqual(full)
    expect(helpers.normalizeMageRenderBudget(Object.fromEntries(Object.keys(full).map(key => [key, Number.MAX_VALUE])))).toEqual(full)
    expect(helpers.normalizeMageRenderBudget(null)).toEqual(full)
    expect(helpers.normalizeMageRenderBudget({ maxFramesPerSecond: Number.NaN, maxRenderPixels: -1, maxDevicePixelRatio: Infinity })).toEqual(full)
    expect(helpers.normalizeMageRenderBudget(preview)).toEqual(preview)
    expect(Object.isFrozen(helpers.normalizeMageRenderBudget())).toBe(true)
  })

  it('publishes independent immutable snapshots of the actual engine configuration', () => {
    const engine = initMAGE({ renderBudget: { maxRaymarchIterations: 64, maxFramesPerSecond: 30 } })
    expect(engine.getRenderBudget()).toEqual({ ...full, maxRaymarchIterations: 64, maxFramesPerSecond: 30 })
    expect(engine.getRenderBudget()).not.toBe(engine.getRenderBudget())
    expect(Object.isFrozen(engine.getRenderBudget())).toBe(true)
  })

  it.each([full, preview])('bounds arbitrary aspect ratios under a $maxLongestEdge edge budget', budget => {
    for (const [width, height] of [[7680, 4320], [1000000, 1], [1, 1000000], [700, 700], [4096, 1000], [Number.MAX_VALUE, Number.MAX_VALUE], [NaN, Infinity]]) {
      expectBounded(helpers.fitMageRenderDimensions(width, height, budget), budget)
    }
  })

  it.each([full, preview])('caps renderer, composer, and auxiliary allocations during resizing', budget => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(4)
    const player = viewportFixture(budget)
    player.engine._syncViewport()
    expect(player.engine.camera.aspect).toBe(3840 / 2160)
    expect(player.canvas.style.width).toBe('')
    player.resize(100, 100)
    player.engine._syncViewport()
    expect(player.canvas.width).toBe(150)
    player.resize(1200, 5000)
    player.engine._syncViewport()
    player.resize(1000000, 1)
    player.engine._syncViewport()
    expect(player.canvas.height).toBe(1)
    player.resize(1, 1000000)
    player.engine._syncViewport()
    expect(player.canvas.width).toBe(1)
    for (const allocation of player.allocations) expectBounded(allocation, budget)
    expect(player.engine.viewportPixelRatio).toBeLessThanOrEqual(1.5)
  })

  it('notices DPR changes without CSS resizing and preserves lower explicit DPR', () => {
    const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1)
    const player = viewportFixture()
    player.resize(400, 200)
    player.engine._syncViewport()
    expect(player.canvas.width).toBe(400)
    dpr.mockReturnValue(3)
    player.engine._syncViewport()
    expect(player.canvas.width).toBe(600)
    player.engine.pixelRatio = 0.5
    player.engine._syncViewport()
    expect(player.canvas.width).toBe(200)
  })

  it('bounds supplied backing attributes before allocating the WebGL context', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 20000
    canvas.height = 12000
    const constructed = vi.fn()
    class Renderer {
      debug = {}
      constructor(options: { canvas: HTMLCanvasElement }) {
        constructed()
        expectBounded(options.canvas, preview)
      }
      setClearColor() {}
    }
    method('#_createRenderer', { WebGLRenderer: Renderer, Color: class {}, SRGBColorSpace: 'srgb' }).call({
      canvas, renderBudget: preview, _syncViewport: vi.fn(), fx: { toneMapping: { exposure: 1 } },
    })
    expect(constructed).toHaveBeenCalledOnce()
  })

  it('starts unused bloom and afterimage targets at one pixel even on huge displays', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(16000)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(9000)
    const engine = initMAGE() as unknown as Engine
    expect(engine.fx.afterImagePass.shader._textureComp.width).toBe(1)
    expect(engine.fx.afterImagePass.shader._textureOld.height).toBe(1)
    expect(engine.fx.bloom.shader.resolution.x).toBe(1)
    expect(engine.fx.bloom.shader.resolution.y).toBe(1)
  })

  it.each([undefined, 64])('caps actual compiled GLSL before GPU compilation (host ceiling %s)', ceiling => {
    const engine = initMAGE({ renderBudget: { maxRaymarchIterations: ceiling } }) as unknown as Engine
    const visualizer = engine.getEngineFields().visualizer
    for (const requested of [1, 48, 198, 200, 999999]) {
      const shader = `setMaxIterations(${requested}); sphere(1);`
      visualizer.load({ shader })
      const material = visualizer.mesh.material
      expect(material.fragmentShader).toContain(`const int MAX_ITERATIONS = ${Math.min(requested, ceiling ?? 200)};`)
      expect(visualizer.getActiveShader()).toBe(shader)
    }
    visualizer.load({ shader: 'sphere(1);' })
    expect(visualizer.mesh.material.fragmentShader).toContain(`const int MAX_ITERATIONS = ${ceiling ?? 200};`)
  })

  it('keeps at most four optional passes in approved order without changing saved flags', () => {
    const start = engineSource.indexOf('\n\tapplyPostProcessing(')
    const end = engineSource.indexOf('\n\t}', start)
    const passes: unknown[] = []
    const apply = new Function('EffectComposer', 'RenderPass', `return function ${engineSource.slice(start + 2, end + 3)}`)(
      class { addPass(pass: unknown) { passes.push(pass) } }, class {},
    ) as Method
    const order = ['glitchPass', 'bloom', 'RGBShift', 'dotShader', 'toonShader', 'afterImagePass', 'copyShader', 'outputPass']
    const fx: Engine = Object.fromEntries(order.map(id => [id, { enabled: true, shader: id, update: vi.fn() }]))
    fx.toonShader.update = vi.fn()
    fx.colorifyShader = { update: vi.fn() }
    fx.getPassOrder = () => order
    apply.call(fx, {}, {}, {}, { dispose: vi.fn() })
    expect(passes.slice(1)).toEqual(['glitchPass', 'bloom', 'RGBShift', 'dotShader', 'copyShader', 'outputPass'])
    expect(order.every(id => fx[id].enabled)).toBe(true)
  })
})

describe('installed MAGE bounded captures', () => {
  it.each([[50000, 50000], [100000, 1], [1, 100000], [512, 512], [NaN, Infinity]])('bounds requested capture %s by %s', (width, height) => {
    expectBounded(helpers.mageCaptureDimensions(width, height), preview)
  })

  it('uses a preview-sized render for capture and restores the playback allocation afterward', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const player = viewportFixture()
    player.engine.scene = {}
    player.engine.composer.render = vi.fn(() => expectBounded(player.canvas, preview))
    player.engine._renderSingleFrame = method('#_renderSingleFrame')
    const capture = method('#_createCaptureCanvas').call(player.engine, 5000, 5000) as HTMLCanvasElement
    expectBounded(capture, preview)
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(player.canvas, 0, 0, 480, 480)
    expect(player.canvas.width).toBeGreaterThan(640)
    expectBounded(player.canvas, full)
  })

  it('restores playback sizing when capture rendering fails and refuses disposed engines', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    const player = viewportFixture()
    player.engine._renderSingleFrame = () => { throw new Error('render failed') }
    expect(() => method('#_createCaptureCanvas').call(player.engine, 224, 224)).toThrow('render failed')
    expectBounded(player.canvas, full)
    player.engine.isDisposed = true
    expect(method('#_createCaptureCanvas').call(player.engine, 224, 224)).toBeNull()
  })

  it('bounds static thumbnail setup and settling before constructing or rendering', async () => {
    const options = vi.fn()
    const render = vi.fn()
    const dispose = vi.fn()
    class ThumbnailEngine {
      renderer = {}
      scene = {}
      camera = {}
      controls = {}
      state = { size: 0 }
      fx = { applyPostProcessing: vi.fn() }
      constructor(config: Engine) {
        options(config)
        expectBounded(config.canvas, preview)
      }
      _createScene() {}
      _syncViewport() {}
      _syncSobelResolution() {}
      loadPreset() { return true }
      _syncPostProcessingFromState() {}
      _waitForPendingSkyboxLoad() { return Promise.resolve() }
      _renderSingleFrame = render
      _captureFramePreviewDataUrlSync = (size: { width: number; height: number }) => { expectBounded(size, preview); return 'data:image/png;base64,fixture' }
      _disposeForThumbnailCapture = dispose
    }
    const result = await method('static async captureThumbnail', { MAGEEngine: ThumbnailEngine }).call({}, {}, { width: 100000, height: 100000, settleFrames: Number.MAX_VALUE })
    expect(result).toBe('data:image/png;base64,fixture')
    expect(options.mock.calls[0][0].renderBudget).toEqual(preview)
    expect(render).toHaveBeenCalledTimes(4)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(helpers.mageCaptureSettleFrames(Infinity)).toBe(2)
    expect(helpers.mageCaptureSettleFrames(-1)).toBe(2)
  })
})

describe('installed MAGE frame scheduling budget', () => {
  const start = engineSource.indexOf('#_render = () => {')
  const end = engineSource.indexOf('\n\t#_growVisualizer()', start)
  const create = new Function('requestAnimationFrame', 'cancelAnimationFrame', 'performance', `return function ${engineSource.slice(start, end).replace('#_render = () =>', 'render()').replaceAll('this.#', 'this.').replace(/;\s*$/, '')}`) as (request: () => number, cancel: () => void, clock: { now(): number }) => Method
  it.each([60, 30])('limits a 240Hz display to %i submitted frames per second while preserving elapsed animation time', fps => {
    let now = 0
    let clockTime = 0
    let delta = 0
    const draw = vi.fn()
    const engine: Engine = {
      renderBudget: { ...full, maxFramesPerSecond: fps }, lastRenderTime: null,
      isRunning: true, isDisposed: false, scene: {}, camera: {}, renderer: { render: draw }, composer: null,
      state: { time: 0, time_multiplier: 1, size: 0, base_speed: 0, easing_speed: 0.5, volume_multiplier: 0 },
      timeIncreasing: true, audioResponseMode: 'legacy', audioAnalyser: null,
      syntheticPreviewEnabled: false, transientWasPlaying: false, previewMode: false,
      clock: { update: () => { delta = (now - clockTime) / 1000; clockTime = now }, getDelta: () => delta },
      controls: { update() {} }, viewportToast: { el: null },
      _syncViewport() {}, _updateViewportInteractionFromBridge() {}, _notifyRenderLifecycle: vi.fn(),
    }
    const tick = create(() => 1, () => {}, { now: () => now })
    tick.call(engine)
    draw.mockClear()
    for (let i = 1; i <= 240; i++) { now = i * 1000 / 240; tick.call(engine) }
    expect(draw).toHaveBeenCalledTimes(fps)
    expect(engine.state.time).toBeCloseTo(1)
    engine.isRunning = false
    now += 1000
    tick.call(engine)
    expect(draw).toHaveBeenCalledTimes(fps)
  })
})
