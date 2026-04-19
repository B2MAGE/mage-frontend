import type { MAGEEngineAPI } from '@notrac/mage'

const SCENE_BLOB_KEYS = [
  'audio',
  'audioPath',
  'controls',
  'fx',
  'intent',
  'settings',
  'state',
  'visualizer',
] as const

const MIN_RUNNING_ENGINE_TIME = 1 / 60
const DEFAULT_ENGINE_CONTROLS = {
  active: true,
  integrated: false,
} as const
const SUPPRESSED_ENGINE_UI_ATTRIBUTE = 'data-mage-player-ui-suppressed'
const SUPPRESSED_ENGINE_UI_SELECTOR = [
  '.mage-embedded-presets',
  '.mage-engine-loading-mask',
  '.mage-fx-layers-overlay',
  '.mage-fx-studio-overlay',
  '.mage-fx-studio-dock',
  '.mage-pane-host',
  '.mage-scene-camera-dock',
  '.mage-dock-launcher',
].join(', ')
const SUPPRESSED_ENGINE_TOOLTIP_SELECTOR = 'img[alt="controls"]'

type MageEngineBridge = {
  captureThumbnail?: MAGEEngineAPI['captureThumbnail']
  dispose: MAGEEngineAPI['dispose']
  getEngineTime?: MAGEEngineAPI['getEngineTime']
  pause: MAGEEngineAPI['pause']
  play: MAGEEngineAPI['play']
  loadPreset: (scene: unknown) => unknown
  setEngineTime?: (time: number) => boolean
  start: MAGEEngineAPI['start']
}

type MageEngineModule = {
  initMAGE: (config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    withControls?: {
      active?: boolean
      integrated?: boolean
    }
  }) => MageEngineBridge
}

export type MageSceneBlob = Record<string, unknown>

export type MagePlayerPlaybackState = 'paused' | 'playing'

export type MagePlayerController = {
  dispose: () => void
  getPlaybackState: () => MagePlayerPlaybackState
  loadSceneBlob: (sceneBlob: unknown) => void
  setPlaybackState: (playbackState: MagePlayerPlaybackState) => MagePlayerPlaybackState
}

export class MagePlayerAdapterError extends Error {}

let mageEngineModulePromise: Promise<MageEngineModule> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMageSceneBlob(value: unknown): value is MageSceneBlob {
  if (!isRecord(value)) {
    return false
  }

  return SCENE_BLOB_KEYS.some((key) => Object.hasOwn(value, key))
}

function loadSceneIntoEngine(engine: MageEngineBridge, sceneBlob: MageSceneBlob) {
  const loadedScene = engine.loadPreset(sceneBlob)

  if (!loadedScene) {
    throw new MagePlayerAdapterError('Scene data could not be rendered by the MAGE engine.')
  }
}

function primeEngineTime(engine: MageEngineBridge) {
  if (
    typeof engine.getEngineTime === 'function' &&
    typeof engine.setEngineTime === 'function' &&
    engine.getEngineTime() <= 0
  ) {
    engine.setEngineTime(MIN_RUNNING_ENGINE_TIME)
  }
}

function applyPlaybackState(
  engine: MageEngineBridge,
  playbackState: MagePlayerPlaybackState,
) {
  if (playbackState === 'paused') {
    engine.pause()
    return playbackState
  }

  // The published engine can stop immediately when it starts from exactly time 0.
  // Prime the engine just past zero before resuming so the scene can animate.
  primeEngineTime(engine)
  engine.play()
  return playbackState
}

function markEngineUiAsSuppressed(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) {
    return
  }

  element.setAttribute(SUPPRESSED_ENGINE_UI_ATTRIBUTE, 'true')
  element.style.display = 'none'
  element.style.pointerEvents = 'none'
}

function hideEmbeddedEngineUi(canvas: HTMLCanvasElement) {
  if (typeof document === 'undefined') {
    return
  }

  const host = canvas.parentElement

  host
    ?.querySelectorAll('.mage-pane-host, .mage-engine-loading-mask')
    .forEach((element) => {
      markEngineUiAsSuppressed(element)
    })

  document.querySelectorAll(SUPPRESSED_ENGINE_UI_SELECTOR).forEach((element) => {
    markEngineUiAsSuppressed(element)
  })

  document.querySelectorAll(SUPPRESSED_ENGINE_TOOLTIP_SELECTOR).forEach((image) => {
    markEngineUiAsSuppressed(image.parentElement)
  })
}

function suppressEmbeddedEngineUi(canvas: HTMLCanvasElement, engine: MageEngineBridge) {
  // Enabling engine controls also boots the package's own preset/tweakpane UI.
  // Disable its thumbnail bootstrap path and hide the generated chrome so the
  // shared React player keeps sole ownership of the visible controls.
  engine.captureThumbnail = undefined
  hideEmbeddedEngineUi(canvas)

  const observationRoot = document.body ?? document.documentElement

  if (!observationRoot || typeof MutationObserver === 'undefined') {
    return () => {}
  }

  const observer = new MutationObserver(() => {
    hideEmbeddedEngineUi(canvas)
  })

  observer.observe(observationRoot, {
    childList: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
  }
}

async function loadMageEngineModule() {
  if (!mageEngineModulePromise) {
    mageEngineModulePromise = (import('@notrac/mage') as Promise<MageEngineModule>).catch((error) => {
      mageEngineModulePromise = null
      throw error
    })
  }

  return mageEngineModulePromise
}

export async function createMagePlayer(
  canvas: HTMLCanvasElement,
  options: { log?: boolean } = {},
): Promise<MagePlayerController> {
  const { initMAGE } = await loadMageEngineModule()
  const engine = initMAGE({
    canvas,
    autoStart: false,
    log: options.log ?? false,
    withControls: DEFAULT_ENGINE_CONTROLS,
  })
  const stopSuppressingEngineUi = suppressEmbeddedEngineUi(canvas, engine)

  engine.start()
  let playbackState: MagePlayerPlaybackState = 'playing'

  function setPlaybackState(nextPlaybackState: MagePlayerPlaybackState) {
    playbackState = applyPlaybackState(engine, nextPlaybackState)
    return playbackState
  }

  return {
    getPlaybackState() {
      return playbackState
    },
    loadSceneBlob(sceneBlob) {
      if (!isMageSceneBlob(sceneBlob)) {
        throw new MagePlayerAdapterError('Scene data is missing required MAGE fields.')
      }

      try {
        loadSceneIntoEngine(engine, sceneBlob)
        setPlaybackState(playbackState)
      } catch (error) {
        if (error instanceof MagePlayerAdapterError) {
          throw error
        }

        throw new MagePlayerAdapterError('Scene data could not be rendered by the MAGE engine.')
      }
    },
    setPlaybackState,
    dispose() {
      stopSuppressingEngineUi()
      engine.dispose()
    },
  }
}
