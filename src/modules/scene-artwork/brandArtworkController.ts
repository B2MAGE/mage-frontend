import type { MAGEEngineAPI } from '@notrac/mage'
import { MagePlayerAdapterError, type MagePlayerPlaybackState } from '../player/infrastructure/playerController'
import { playerPageLifecycle } from '../player/infrastructure/playerPageLifecycle'
import { playerStartupCancelled, waitForPlayerStartup } from '../player/infrastructure/playerStartup'
import { attachViewerMouseInteractions, type ViewerMouseEngine } from '../player/infrastructure/viewerMouseInteractions'
import { boundCaptureSize, getRenderBudget, type RenderBudget } from '../player/policy/renderBudget'
import { validateSceneForPlayback } from '../player/policy/sceneValidation'
import { sceneRecovery } from '../player/recovery/sceneRecovery'
import { BRAND_SCENE } from '../player/templates/platformBrandScene'

export type BrandArtworkController = {
  captureFramePreview: () => Promise<string | null>
  setPlaybackState: (state: MagePlayerPlaybackState) => void
  setSyntheticPreview: (enabled: boolean) => void
  dispose: () => void
}

type ArtworkEngine = Pick<MAGEEngineAPI, 'start' | 'pause' | 'dispose' | 'captureFramePreview' | 'setSyntheticPreview' | 'subscribeRenderLifecycle'>
  & ViewerMouseEngine & { loadPreset: (scene: unknown) => unknown }
type ArtworkEngineModule = {
  initMAGE: (options: {
    canvas: HTMLCanvasElement; autoStart: false; log: false; renderBudget: RenderBudget
    withControls: { active: false; integrated: false }
  }) => ArtworkEngine
}

// Keep the thumbnail preview rhythm at half tempo (66 BPM for seed 73).
const BRAND_BEAT_SEED = 73
const BRAND_BEAT_TEMPO_SCALE = 0.5
let engineModule: Promise<ArtworkEngineModule> | null = null
function loadArtworkEngine() {
  engineModule ??= (import('@notrac/mage') as unknown as Promise<ArtworkEngineModule>).catch(error => {
    engineModule = null
    throw error
  })
  return engineModule
}

/** The sole local renderer accepts no scene source and loads only our frozen artwork. */
export async function createBrandArtworkController(canvas: HTMLCanvasElement, options: {
  signal?: AbortSignal
  onError?: () => void
} = {}): Promise<BrandArtworkController> {
  const generation = playerPageLifecycle.generation
  function assertAllowed() {
    if (options.signal?.aborted) throw playerStartupCancelled()
    if (playerPageLifecycle.suspended || generation !== playerPageLifecycle.generation) {
      throw new MagePlayerAdapterError('Artwork creation was interrupted by page navigation.')
    }
    if (sceneRecovery.isSafeMode()) throw new MagePlayerAdapterError('Artwork rendering is paused in safe mode.')
  }
  assertAllowed()
  const scene = validateSceneForPlayback(BRAND_SCENE)
  if (scene.kind !== 'custom') throw new MagePlayerAdapterError('The built-in artwork is unavailable.')
  const { initMAGE } = await waitForPlayerStartup(loadArtworkEngine(), options.signal)
  assertAllowed()
  const engine = initMAGE({ canvas, autoStart: false, log: false,
    renderBudget: getRenderBudget('preview'), withControls: { active: false, integrated: false } })
  let disposed = false
  let mouse: ReturnType<typeof attachViewerMouseInteractions> | undefined
  let releaseRendering: (() => void) | undefined

  function dispose() {
    if (disposed) return
    disposed = true
    window.removeEventListener('pagehide', stop)
    canvas.removeEventListener('webglcontextlost', fail)
    options.signal?.removeEventListener('abort', stop)
    releaseSafeMode()
    releaseRendering?.()
    try { mouse?.dispose() } finally { engine.dispose() }
  }
  function stop() {
    try { dispose() } catch { /* The instance stays stopped even if GPU cleanup fails. */ }
  }
  function fail() {
    if (disposed) return
    stop()
    options.onError?.()
  }
  function assertUsable() {
    assertAllowed()
    if (disposed) throw new MagePlayerAdapterError('This artwork renderer has stopped.')
  }

  window.addEventListener('pagehide', stop)
  canvas.addEventListener('webglcontextlost', fail)
  options.signal?.addEventListener('abort', stop, { once: true })
  const releaseSafeMode = sceneRecovery.subscribe(() => { if (sceneRecovery.isSafeMode()) stop() })
  try {
    releaseRendering = engine.subscribeRenderLifecycle(event => { if (event.type === 'error') fail() })
    if (disposed) { releaseRendering(); assertUsable() }
    // start() initializes MAGE's graphics resources. Pause before loading the
    // fixed scene so its first captured frame retains the authored time/state.
    engine.start()
    assertUsable()
    engine.pause()
    mouse = attachViewerMouseInteractions(canvas, engine)
    if (!engine.loadPreset(scene.scene)) throw new MagePlayerAdapterError('The built-in artwork could not be rendered.')
    mouse.sceneLoaded()
    engine.setSyntheticPreview(false, BRAND_BEAT_SEED, BRAND_BEAT_TEMPO_SCALE)
    assertUsable()
  } catch (error) {
    stop()
    throw error
  }

  return {
    async captureFramePreview() {
      assertUsable()
      const dimensions = boundCaptureSize(canvas.width, canvas.height)
      const frame = await engine.captureFramePreview(dimensions)
      // A completed image cannot revive a renderer released during capture.
      if (disposed) return null
      assertUsable()
      return frame
    },
    setPlaybackState(state) {
      assertUsable()
      try {
        if (state === 'playing') engine.start()
        else engine.pause()
        assertUsable()
      } catch (error) { fail(); throw error }
    },
    setSyntheticPreview(enabled) {
      assertUsable()
      engine.setSyntheticPreview(enabled, BRAND_BEAT_SEED, BRAND_BEAT_TEMPO_SCALE)
    },
    dispose,
  }
}
