import type { RenderFailure } from '../recovery/sceneRecovery'
export type SceneActivation = { beforeActivate(): void; onActivated(): void }

/** A rejected scene operation is distinct from a failed renderer session. */
export class SceneReplacementError extends Error {
  readonly reason: RenderFailure | 'load'
  readonly retained: boolean
  constructor(reason: RenderFailure | 'load', retained: boolean, message?: string) {
    super(message ?? (retained ? 'The replacement scene could not be prepared. The previous scene is still available.' : 'The scene could not be prepared.'))
    this.name = 'SceneReplacementError'
    this.reason = reason
    this.retained = retained
  }
}

export const isSceneReplacementError = (error: unknown): error is SceneReplacementError => error instanceof SceneReplacementError
