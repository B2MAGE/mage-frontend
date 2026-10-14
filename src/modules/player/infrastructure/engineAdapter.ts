import { createIsolatedMageController } from './isolatedController'
import { MagePlayerAdapterError, type MagePlayerController, type MagePlayerOptions } from './playerController'
import { playerPageLifecycle } from './playerPageLifecycle'
import { playerStartupCancelled } from './playerStartup'
import { validateSceneForPlayback } from '../policy/sceneValidation'
export * from './playerController'

/** Every submitted scene, including templates, crosses the isolated renderer boundary. */
export async function createMagePlayer(target: HTMLElement, options: MagePlayerOptions = {}): Promise<MagePlayerController> {
  if (options.signal?.aborted) throw playerStartupCancelled()
  if (playerPageLifecycle.suspended) throw new MagePlayerAdapterError('Player creation was interrupted by page navigation.')
  if (options.initialSceneBlob === undefined) throw new MagePlayerAdapterError('Supply a valid initial scene before creating a player.')
  validateSceneForPlayback(options.initialSceneBlob)
  return createIsolatedMageController(target, options)
}
