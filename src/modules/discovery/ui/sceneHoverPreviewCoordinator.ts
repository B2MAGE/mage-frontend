import {
  createMagePlayer,
  sceneRecovery,
  sceneRecoveryKey,
  sceneAvailabilityStore,
  type MagePlayerController,
  type MageSceneBlob,
} from '@modules/player'

const PREVIEW_DELAY_MS = 300
const PREVIEW_FADE_MS = 180
const PREVIEW_FRAME_COUNT = 2

export type SceneHoverPreviewRegistration = {
  sceneBlob: MageSceneBlob
  sceneId: number
  seed: number
  target: HTMLElement
  shouldPreview: () => boolean
}

type PreviewRegistrationId = symbol
type ActivePreview = {
  id: PreviewRegistrationId
  canvas: HTMLCanvasElement
  controller: MagePlayerController | null
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

class SceneHoverPreviewCoordinator {
  private active: ActivePreview | null = null
  private pendingId: PreviewRegistrationId | null = null
  private pendingTimer: number | null = null
  private pageSuspended = false
  private readonly fadingCanvases = new Map<HTMLCanvasElement, number>()
  private readonly registrations = new Map<PreviewRegistrationId, SceneHoverPreviewRegistration>()
  private readonly availabilitySubscriptions = new Map<PreviewRegistrationId, () => void>()

  constructor() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('pagehide', this.handlePageHide, true)
    window.addEventListener('pageshow', this.handlePageShow)
    sceneRecovery.subscribe(this.handleRecoveryChange)
  }

  register(id: PreviewRegistrationId, registration: SceneHoverPreviewRegistration) {
    this.availabilitySubscriptions.get(id)?.()
    this.registrations.set(id, registration)
    this.availabilitySubscriptions.set(id, sceneAvailabilityStore.subscribe(registration.sceneId, this.handleRecoveryChange))
  }

  unregister(id: PreviewRegistrationId) {
    this.registrations.delete(id)
    this.cancel(id)
    this.availabilitySubscriptions.get(id)?.()
    this.availabilitySubscriptions.delete(id)
    if (this.registrations.size === 0) {
      this.cancelPendingActivation()
      this.stopActivePreview()
      for (const [canvas, timer] of this.fadingCanvases) {
        window.clearTimeout(timer)
        canvas.remove()
      }
      this.fadingCanvases.clear()
    }
  }

  schedule(id: PreviewRegistrationId) {
    if (!this.canPreview(id) || this.active?.id === id || this.pendingId === id) return
    this.cancelPendingActivation()
    this.pendingId = id
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null
      this.pendingId = null
      void this.activate(id)
    }, PREVIEW_DELAY_MS)
  }

  cancel(id: PreviewRegistrationId) {
    if (this.pendingId === id) this.cancelPendingActivation()
    if (this.active?.id === id) this.stopActivePreview()
  }

  private canPreview(id: PreviewRegistrationId) {
    const registration = this.registrations.get(id)
    if (!registration || !sceneAvailabilityStore.isAllowed(registration.sceneId) || this.pageSuspended || document.visibilityState === 'hidden' || sceneRecovery.isSafeMode() || !registration.shouldPreview()) return false
    const key = sceneRecoveryKey(registration.sceneBlob, registration.sceneId)
    return !!key && !sceneRecovery.getAutomaticBlock(key)
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.cancelPendingActivation()
      this.stopActivePreview()
    }
  }

  private readonly handleRecoveryChange = () => {
    if (this.pendingId && !this.canPreview(this.pendingId)) this.cancelPendingActivation()
    if (this.active && !this.canPreview(this.active.id)) this.stopActivePreview()
  }

  private readonly handlePageHide = () => {
    this.pageSuspended = true
    this.cancelPendingActivation()
  }

  private readonly handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return
    this.pageSuspended = false
    const previousId = this.active?.id
    this.cancelPendingActivation()
    this.stopActivePreview(false)
    // Restore only a card that is still visible and hovered/focused. The
    // adapter disposed its old engine before this document entered BFCache.
    const nextId = previousId && this.canPreview(previousId) ? previousId
      : [...this.registrations.keys()].find((id) => this.canPreview(id))
    if (nextId) this.schedule(nextId)
  }

  private cancelPendingActivation() {
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    this.pendingId = null
  }

  private async activate(id: PreviewRegistrationId) {
    const registration = this.registrations.get(id)
    if (!registration || !this.canPreview(id)) return
    this.stopActivePreview()

    // Disposing a renderer ends its recovery marker and loses the WebGL context.
    // A subsequent hover gets a fresh canvas, including while creation is pending.
    const canvas = document.createElement('canvas')
    canvas.className = 'scene-card__preview-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.tabIndex = -1
    const activation: ActivePreview = { id, canvas, controller: null }
    this.active = activation
    registration.target.append(canvas)

    try {
      const controller = await createMagePlayer(canvas, { sceneKey: registration.sceneId, renderProfile: 'preview', initialSceneBlob: registration.sceneBlob })
      if (this.active !== activation || !this.canPreview(id)) {
        controller.dispose()
        if (this.active === activation) this.stopActivePreview(false)
        return
      }

      activation.controller = controller
      controller.loadSceneBlob(registration.sceneBlob, { sceneKey: registration.sceneId })
      if (this.active !== activation || !this.canPreview(id)) {
        if (this.active === activation) this.stopActivePreview(false)
        return
      }
      controller.setSyntheticPreview(true, registration.seed)
      controller.setPlaybackState('playing')

      for (let frame = 0; frame < PREVIEW_FRAME_COUNT; frame += 1) {
        await nextAnimationFrame()
        if (this.active !== activation || !this.canPreview(id)) {
          if (this.active === activation) this.stopActivePreview(false)
          return
        }
      }
      canvas.classList.add('is-visible')
    } catch {
      if (this.active === activation) this.stopActivePreview(false)
    }
  }

  private stopActivePreview(fade = true) {
    const activation = this.active
    if (!activation) return
    this.active = null
    activation.canvas.classList.remove('is-visible')
    if (activation.controller) {
      try {
        activation.controller.setSyntheticPreview(false)
        activation.controller.setPlaybackState('paused')
      } catch {
        // Disposal must still finish a failed render attempt.
      }
      try {
        activation.controller.dispose()
      } catch {
        // The adapter retains an interrupted marker when cleanup cannot finish.
        // Other cards and recovery controls must still receive store updates.
      }
    }

    if (fade) {
      const timer = window.setTimeout(() => {
        activation.canvas.remove()
        this.fadingCanvases.delete(activation.canvas)
      }, PREVIEW_FADE_MS)
      this.fadingCanvases.set(activation.canvas, timer)
    } else {
      activation.canvas.remove()
    }
  }
}

export const sceneHoverPreviewCoordinator = new SceneHoverPreviewCoordinator()

export function createSceneHoverPreviewRegistrationId(): PreviewRegistrationId {
  return Symbol('scene-hover-preview')
}
