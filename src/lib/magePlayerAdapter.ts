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

type MageEngineBridge = {
  dispose: () => void
  loadPreset: (scene: unknown) => unknown
  start: () => void
}

type MageEngineModule = {
  initMAGE: (config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    withControls?: boolean
  }) => MageEngineBridge
}

export type MageSceneBlob = Record<string, unknown>

export type MagePlayerController = {
  dispose: () => void
  loadSceneBlob: (sceneBlob: unknown) => void
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

async function loadMageEngineModule() {
  if (!mageEngineModulePromise) {
    mageEngineModulePromise = (import('@mage/engine') as Promise<MageEngineModule>).catch((error) => {
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
    withControls: false,
    autoStart: false,
    log: options.log ?? false,
  })

  engine.start()

  return {
    loadSceneBlob(sceneBlob) {
      if (!isMageSceneBlob(sceneBlob)) {
        throw new MagePlayerAdapterError('Scene data is missing required MAGE fields.')
      }

      try {
        const loadedScene = engine.loadPreset(sceneBlob)

        if (!loadedScene) {
          throw new MagePlayerAdapterError(
            'Scene data could not be rendered by the MAGE engine.',
          )
        }
      } catch (error) {
        if (error instanceof MagePlayerAdapterError) {
          throw error
        }

        throw new MagePlayerAdapterError('Scene data could not be rendered by the MAGE engine.')
      }
    },
    dispose() {
      engine.dispose()
    },
  }
}
