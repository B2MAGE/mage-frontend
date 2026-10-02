import type { InputState } from '@notrac/mage'
import { attachViewerPointerDeformation, type ViewerPointerMesh } from './viewerPointerDeformation'

// Keep the engine's mutable input boundary inside player infrastructure. Its
// native controls bootstrap also installs editor shortcuts and global listeners.
export type ViewerMouseEngine = {
  getEngineFields: () => {
    controlSettings: { active: boolean; integrated: boolean }
    camera: {
      near: number
      position: { distanceTo: (target: { x: number; y: number; z: number }) => number }
    }
    controls: {
      enabled: boolean
      enableRotate: boolean
      enableZoom: boolean
      enablePan: boolean
      target: { x: number; y: number; z: number }
      minDistance: number
      maxDistance: number
      zoomSpeed: number
      mouseButtons: { MIDDLE: number | null; RIGHT: number | null }
      touches: { ONE: number | null; TWO: number | null }
      cursorStyle: string
    }
    state: { currMouse: { set: (x: number, y: number, z: number) => void } }
    visualizer: {
      render_tooltips: boolean
      mesh: ViewerPointerMesh | null
      getActiveShader: () => string | null
    }
  }
  setInputState: (input: InputState) => void
}

const VIEWER_ONLY_INPUT = {
  requestToggleUI: false,
  requestResetVisualizer: false,
  requestNextShader: false,
  requestPreviousShader: false,
  requestWheelDirection: 0,
} as const

export function attachViewerMouseInteractions(
  canvas: HTMLCanvasElement,
  engine: ViewerMouseEngine,
  { wheelZoom = false }: { wheelZoom?: boolean } = {},
) {
  const fields = engine.getEngineFields()
  // Keep native left-button orbiting, but never bootstrap the engine's editor
  // or global shader-switching shortcuts. Artwork keeps wheel scrolling, and
  // touch gestures remain browser-owned on every surface.
  fields.controls.enableRotate = true
  fields.controls.enableZoom = wheelZoom
  if (wheelZoom) fields.controls.zoomSpeed = 0.65
  fields.controls.enablePan = false
  fields.controls.mouseButtons.MIDDLE = null
  fields.controls.mouseButtons.RIGHT = null
  fields.controls.touches.ONE = null
  fields.controls.touches.TWO = null
  fields.controls.cursorStyle = 'grab'
  canvas.style.touchAction = 'auto'

  let pressedPointer: number | null = null
  let disposed = false
  let currentMesh: ViewerPointerMesh | null = null
  let deformation: ReturnType<typeof attachViewerPointerDeformation> | null = null

  function syncDeformation() {
    const mesh = fields.visualizer.mesh
    if (currentMesh === mesh) return
    deformation?.dispose()
    currentMesh = mesh
    deformation = attachViewerPointerDeformation(mesh, fields.visualizer.getActiveShader() ?? '')
  }

  function reset() {
    if (disposed) return
    pressedPointer = null
    syncDeformation()
    deformation?.update(0, 0, 0, 0)
    fields.state.currMouse.set(0, 0, 0)
    engine.setInputState({ ...VIEWER_ONLY_INPUT, pointerOverUi: true, currPointerDown: 0 })
  }

  function prepareSceneLoad() {
    if (disposed || !wheelZoom) return
    // OrbitControls.reset() runs during preset loading. Old limits must not
    // clamp the new scene's authored camera before we can measure its distance.
    fields.controls.minDistance = 0
    fields.controls.maxDistance = Infinity
  }

  function sceneLoaded() {
    if (disposed) return
    if (wheelZoom) {
      const distance = fields.camera.position.distanceTo(fields.controls.target)
      const radius = Number.isFinite(distance) && distance > 0 ? distance : 5.5
      const near = Number.isFinite(fields.camera.near) && fields.camera.near > 0 ? fields.camera.near : 0.1
      fields.controls.minDistance = Math.min(radius, Math.max(near * 4, radius * 0.4))
      fields.controls.maxDistance = radius * 2.5
    }
    reset()
  }

  function updatePointer(event: PointerEvent) {
    if (disposed || event.pointerType === 'touch') return
    if (pressedPointer === event.pointerId && !(event.buttons & 1)) pressedPointer = null
    const rect = canvas.getBoundingClientRect()
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width * 2 - 1 : 0
    const y = rect.height > 0 ? 1 - (event.clientY - rect.top) / rect.height * 2 : 0
    deformation?.update(x, y, 1, pressedPointer === event.pointerId ? 1 : 0)
    engine.setInputState({
      ...VIEWER_ONLY_INPUT,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerOverUi: false,
      currPointerDown: pressedPointer === event.pointerId ? 1 : 0,
    })
  }

  function press(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0) return
    pressedPointer = event.pointerId
    updatePointer(event)
  }

  function release(event: PointerEvent) {
    if (event.pointerId !== pressedPointer) return
    pressedPointer = null
    if (event.target === canvas) updatePointer(event)
    else reset()
  }

  function onVisibilityChange() {
    if (document.hidden) reset()
  }

  function filterNativePointer(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0) event.stopImmediatePropagation()
  }

  function preserveContextMenu(event: MouseEvent) {
    // OrbitControls prevents the context menu even with right-button pan off.
    // Stop its canvas listener, without preventing the browser's default action.
    event.stopImmediatePropagation()
  }

  function prepareWheel(event: WheelEvent) {
    if (disposed || !wheelZoom) return
    if (event.ctrlKey || event.metaKey) {
      // Keep browser zoom shortcuts and trackpad pinch browser-owned.
      event.stopImmediatePropagation()
      return
    }
    fields.controls.enabled = true
    engine.setInputState({
      ...VIEWER_ONLY_INPUT,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerOverUi: false,
      currPointerDown: pressedPointer === null ? 0 : 1,
    })
  }

  sceneLoaded()
  fields.controlSettings.active = true
  fields.controlSettings.integrated = false
  fields.controls.enabled = true
  fields.visualizer.render_tooltips = false
  canvas.addEventListener('pointerdown', filterNativePointer, true)
  canvas.addEventListener('contextmenu', preserveContextMenu, true)
  canvas.addEventListener('wheel', prepareWheel, { capture: true, passive: true })
  canvas.addEventListener('pointerenter', updatePointer, { passive: true })
  canvas.addEventListener('pointermove', updatePointer, { passive: true })
  canvas.addEventListener('pointerdown', press, { passive: true })
  canvas.addEventListener('pointerleave', reset)
  canvas.addEventListener('pointercancel', reset)
  canvas.addEventListener('lostpointercapture', reset)
  window.addEventListener('pointerup', release, { passive: true })
  window.addEventListener('blur', reset)
  window.addEventListener('scroll', reset, { capture: true, passive: true })
  window.addEventListener('resize', reset)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    reset,
    prepareSceneLoad,
    sceneLoaded,
    dispose() {
      if (disposed) return
      reset()
      disposed = true
      deformation?.dispose()
      canvas.removeEventListener('pointerdown', filterNativePointer, true)
      canvas.removeEventListener('contextmenu', preserveContextMenu, true)
      canvas.removeEventListener('wheel', prepareWheel, true)
      canvas.removeEventListener('pointerenter', updatePointer)
      canvas.removeEventListener('pointermove', updatePointer)
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerleave', reset)
      canvas.removeEventListener('pointercancel', reset)
      canvas.removeEventListener('lostpointercapture', reset)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('blur', reset)
      window.removeEventListener('scroll', reset, true)
      window.removeEventListener('resize', reset)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      fields.controlSettings.active = false
      fields.controls.enabled = false
      canvas.style.cursor = ''
    },
  }
}
