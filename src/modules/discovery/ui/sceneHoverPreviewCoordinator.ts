import {
  createMagePlayer,
  type MagePlayerController,
  type MageSceneBlob,
} from '@modules/player'

const PREVIEW_DELAY_MS = 300
const PREVIEW_FADE_MS = 180
const PREVIEW_FRAME_COUNT = 2

export type SceneHoverPreviewRegistration = {
  sceneBlob: MageSceneBlob
  seed: number
  target: HTMLElement
}

type PreviewRegistrationId = symbol

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

class SceneHoverPreviewCoordinator {
  private activeId: PreviewRegistrationId | null = null
  private activationVersion = 0
  private canvas: HTMLCanvasElement | null = null
  private controller: MagePlayerController | null = null
  private controllerPromise: Promise<MagePlayerController> | null = null
  private detachTimer: number | null = null
  private pendingId: PreviewRegistrationId | null = null
  private pendingTimer: number | null = null
  private readonly registrations = new Map<PreviewRegistrationId, SceneHoverPreviewRegistration>()

  constructor() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  register(id: PreviewRegistrationId, registration: SceneHoverPreviewRegistration) {
    this.registrations.set(id, registration)
  }

  unregister(id: PreviewRegistrationId) {
    this.registrations.delete(id)

    if (this.pendingId === id) {
      this.cancelPendingActivation()
    }

    if (this.activeId === id) {
      this.stopActivePreview()
    }

    if (this.registrations.size === 0) {
      this.dispose()
    }
  }

  schedule(id: PreviewRegistrationId) {
    if (!this.registrations.has(id) || document.visibilityState === 'hidden') {
      return
    }

    if (this.activeId === id || this.pendingId === id) {
      return
    }

    this.cancelPendingActivation()
    this.pendingId = id
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null
      this.pendingId = null
      void this.activate(id)
    }, PREVIEW_DELAY_MS)
  }

  cancel(id: PreviewRegistrationId) {
    if (this.pendingId === id) {
      this.cancelPendingActivation()
    }

    if (this.activeId === id) {
      this.stopActivePreview()
    }
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.cancelPendingActivation()
      this.stopActivePreview()
    }
  }

  private cancelPendingActivation() {
    if (this.pendingTimer !== null) {
      window.clearTimeout(this.pendingTimer)
    }

    this.pendingTimer = null
    this.pendingId = null
  }

  private cancelPendingDetach() {
    if (this.detachTimer !== null) {
      window.clearTimeout(this.detachTimer)
      this.detachTimer = null
    }
  }

  private scheduleCanvasDetach() {
    this.cancelPendingDetach()
    const canvas = this.canvas

    if (!canvas) {
      return
    }

    this.detachTimer = window.setTimeout(() => {
      this.detachTimer = null
      if (this.canvas === canvas && this.activeId === null) {
        canvas.remove()
      }
    }, PREVIEW_FADE_MS)
  }

  private createCanvas() {
    const canvas = document.createElement('canvas')
    canvas.className = 'scene-card__preview-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.tabIndex = -1
    return canvas
  }

  private async ensureController() {
    if (this.controller) {
      return this.controller
    }

    if (!this.canvas) {
      this.canvas = this.createCanvas()
    }

    if (!this.controllerPromise) {
      const canvas = this.canvas
      this.controllerPromise = createMagePlayer(canvas)
        .then((controller) => {
          this.controller = controller
          return controller
        })
        .finally(() => {
          this.controllerPromise = null
        })
    }

    return this.controllerPromise
  }

  private async activate(id: PreviewRegistrationId) {
    const registration = this.registrations.get(id)
    if (!registration || document.visibilityState === 'hidden') {
      return
    }

    const version = ++this.activationVersion
    this.stopActivePreview(false)
    this.cancelPendingDetach()
    this.activeId = id

    if (!this.canvas) {
      this.canvas = this.createCanvas()
    }

    this.canvas.classList.remove('is-visible')
    registration.target.append(this.canvas)

    try {
      const controller = await this.ensureController()

      if (!this.isCurrentActivation(id, version)) {
        if (this.activeId === null) {
          this.stopController(controller)
        }
        return
      }

      controller.loadSceneBlob(registration.sceneBlob)
      controller.setSyntheticPreview(true, registration.seed)
      controller.setPlaybackState('playing')

      for (let frame = 0; frame < PREVIEW_FRAME_COUNT; frame += 1) {
        await nextAnimationFrame()
        if (!this.isCurrentActivation(id, version)) {
          return
        }
      }

      this.canvas?.classList.add('is-visible')
    } catch {
      if (this.isCurrentActivation(id, version)) {
        this.discardController()
      }
    }
  }

  private isCurrentActivation(id: PreviewRegistrationId, version: number) {
    return (
      this.activeId === id &&
      this.activationVersion === version &&
      this.registrations.has(id) &&
      document.visibilityState !== 'hidden'
    )
  }

  private stopController(controller: MagePlayerController) {
    try {
      controller.setSyntheticPreview(false)
      controller.setPlaybackState('paused')
    } catch {
      // A failed or partially initialized scene still needs its canvas removed.
    }
  }

  private stopActivePreview(invalidateActivation = true) {
    if (invalidateActivation) {
      this.activationVersion += 1
    }

    if (this.controller) {
      this.stopController(this.controller)
    }

    this.activeId = null
    this.canvas?.classList.remove('is-visible')
    this.scheduleCanvasDetach()
  }

  private discardController() {
    this.activationVersion += 1
    this.activeId = null
    this.cancelPendingDetach()

    const controller = this.controller
    this.controller = null
    if (controller) {
      this.stopController(controller)
      controller.dispose()
    }

    this.canvas?.remove()
    this.canvas = null
  }

  private dispose() {
    this.cancelPendingActivation()
    this.cancelPendingDetach()
    this.stopActivePreview()
    this.cancelPendingDetach()

    if (this.controllerPromise) {
      this.controllerPromise
        .then((controller) => {
          if (this.registrations.size === 0) {
            controller.dispose()
            if (this.controller === controller) {
              this.controller = null
            }
            this.canvas?.remove()
            this.canvas = null
          }
        })
        .catch(() => undefined)
      return
    }

    this.controller?.dispose()
    this.controller = null
    this.canvas?.remove()
    this.canvas = null
  }
}

export const sceneHoverPreviewCoordinator = new SceneHoverPreviewCoordinator()

export function createSceneHoverPreviewRegistrationId(): PreviewRegistrationId {
  return Symbol('scene-hover-preview')
}
