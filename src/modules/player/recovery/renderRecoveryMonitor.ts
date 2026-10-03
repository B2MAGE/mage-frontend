export type RenderLifecycleEvent = { type: 'frame' } | { type: 'error' }
export type RenderFailure = 'runtime' | 'context-lost' | 'startup-timeout' | 'progress-timeout'

export const RENDER_STARTUP_TIMEOUT_MS = 15_000
export const RENDER_PROGRESS_TIMEOUT_MS = 10_000

/** Counts observed foreground time, never the animation's intentionally editable clock. */
export function monitorSceneRendering(options: {
  canvas: HTMLCanvasElement
  subscribe?: (listener: (event: RenderLifecycleEvent) => void) => () => void
  onFailure: (reason: RenderFailure) => void
}) {
  let disposed = false
  let paused = false
  let rendered = false
  let elapsed = 0
  let previous = performance.now()
  let wasHidden = document.visibilityState === 'hidden'
  let unsubscribe: (() => void) | undefined = undefined
  let timer: number | null = null

  function fail(reason: RenderFailure) {
    if (disposed) return
    dispose()
    options.onFailure(reason)
  }

  unsubscribe = options.subscribe?.((event) => {
    if (disposed) return
    if (event.type === 'error') fail('runtime')
    else {
      rendered = true
      elapsed = 0
      previous = performance.now()
    }
  })
  if (disposed) unsubscribe?.()

  function onContextLost() { fail('context-lost') }
  function onVisibilityChange() {
    wasHidden = document.visibilityState === 'hidden'
    elapsed = 0
    previous = performance.now()
  }
  if (!disposed) {
    options.canvas.addEventListener('webglcontextlost', onContextLost)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  // Older/adapted renderers without a completed-frame signal must not produce
  // invented timeouts. Context-loss recovery still works for those renderers.
  timer = options.subscribe && !disposed ? window.setInterval(() => {
    const now = performance.now()
    const delta = now - previous
    previous = now
    const hidden = document.visibilityState === 'hidden'
    if (disposed || paused || hidden || wasHidden || delta < 0 || delta > 2_000) {
      // A delayed task may be browser suspension, OS sleep or a busy main
      // thread. Restart observation rather than blaming that gap on a scene.
      elapsed = 0
      wasHidden = hidden
      return
    }
    elapsed += delta
    if (elapsed >= (rendered ? RENDER_PROGRESS_TIMEOUT_MS : RENDER_STARTUP_TIMEOUT_MS)) {
      fail(rendered ? 'progress-timeout' : 'startup-timeout')
    }
  }, 250) : null

  function dispose() {
    if (disposed) return
    disposed = true
    if (timer !== null) window.clearInterval(timer)
    unsubscribe?.()
    options.canvas.removeEventListener('webglcontextlost', onContextLost)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  return {
    dispose,
    setPaused(next: boolean) {
      paused = next
      elapsed = 0
      previous = performance.now()
    },
  }
}
