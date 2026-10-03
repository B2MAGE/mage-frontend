import { getRenderBudget } from '../modules/player/policy/renderBudget'
import type { SampleLoader } from './runtime'
import type { MAGEEngineAPI, MAGEPreset } from '@notrac/mage'

// The package declares loadPreset as void, although the installed runtime returns
// the loaded preset (or undefined on failure), as used by our existing adapter.
type SampleEngine = Omit<MAGEEngineAPI, 'loadPreset'> & { loadPreset: (preset: MAGEPreset) => unknown }

// This is the only source accepted by PP-I01. Loading user scenes is PP-I02/PP-I03.
const SAMPLE = {
  visualizer: {
    skyboxPreset: 6, scale: 1,
    shader: 'setMaxIterations(80); setStepSize(0.7); rotateY(time * 0.4); rotateX(0.35); color(0.28, 0.12, 0.9); torus(0.8, 0.18);',
  },
  controls: { target0: { x: 0, y: 0, z: 0 }, position0: { x: 0, y: 0, z: 4.5 }, zoom0: 1 },
  intent: { time_multiplier: 0.5, autoRotate: false, fov: 50 },
  fx: { passOrder: ['bloom', 'outputPass'], bloom: { enabled: false }, passes: { outputPass: true } },
}

export const loadKnownSample: SampleLoader = async (canvas, signal, onError) => {
  const { initMAGE } = await import('@notrac/mage')
  signal.throwIfAborted()
  const engine = initMAGE({ canvas, autoStart: false, log: false, pixelRatio: 1,
    withControls: { active: false, integrated: false }, renderBudget: getRenderBudget('preview') }) as unknown as SampleEngine
  let released = false
  let unsubscribe = () => {}
  let rejectPending: (reason: Error) => void = () => {}
  function dispose() {
    if (released) return
    released = true
    signal.removeEventListener('abort', dispose)
    try { unsubscribe() } catch { /* Always continue releasing the engine. */ }
    try { engine.dispose() } catch { /* Frame removal is the final cleanup boundary. */ }
    rejectPending(new Error('Rendering stopped.'))
  }
  signal.addEventListener('abort', dispose, { once: true })
  try {
    // A compile result is not a successful frame. Observe the patched renderer's lifecycle.
    await new Promise<void>((resolve, reject) => {
      rejectPending = reject
      let loaded = false
      unsubscribe = engine.subscribeRenderLifecycle(event => {
        if (event.type === 'error') {
          onError()
          dispose()
          reject(new Error('Rendering failed.'))
        } else if (loaded) {
          resolve()
        }
      })
      engine.start()
      if (released) throw new Error('Renderer failed during startup.')
      if (!engine.loadPreset(SAMPLE)) throw new Error('Sample could not load.')
      loaded = true
      engine.play()
      if (signal.aborted) dispose()
    })
    return dispose
  } catch (error) {
    dispose()
    throw error
  }
}
