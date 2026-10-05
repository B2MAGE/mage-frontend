import { createIsolatedPlaybackHost } from '../src/modules/player/isolation/playbackHost'
import { fixedRecoveryScene, type FixedRecoveryCase, type FixedRecoveryMarker } from '../src/modules/player/isolation/fixedRecoveryProtocol'
import type { RenderFailure } from '../src/modules/player/recovery/renderRecoveryMonitor'

export type RecoveryCheckResult = { name: string; outcome: 'PASS' | 'FAIL' | 'UNSUPPORTED'; evidence: string }
export const RECOVERY_FIXTURE_VERSION = 'fixed-renderer-recovery-1'
const cancelled = () => new DOMException('Checks stopped.', 'AbortError')

/** Parent observations use the real host; fault injection is a separate fixed bootstrap. */
export async function runFixedRecoveryChecks(options: {
  container: HTMLElement; rendererUrl: string; signal: AbortSignal; startupTimeoutMs: number
  result: (value: RecoveryCheckResult) => void
}, createHost = createIsolatedPlaybackHost) {
  let current: ReturnType<typeof createHost> | null = null
  const live = () => { if (options.signal.aborted) throw cancelled() }
  const stop = () => { current?.dispose(); current = null }
  const wait = (predicate: () => boolean, milliseconds: number) => new Promise<boolean>((resolve, reject) => {
    const started = performance.now()
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (value: boolean) => { if (timer !== null) clearTimeout(timer); options.signal.removeEventListener('abort', abort); resolve(value) }
    const abort = () => { if (timer !== null) clearTimeout(timer); options.signal.removeEventListener('abort', abort); reject(cancelled()) }
    const tick = () => {
      if (options.signal.aborted) return abort()
      if (predicate()) return finish(true)
      if (performance.now() - started >= milliseconds) return finish(false)
      timer = setTimeout(tick, 25)
    }
    options.signal.addEventListener('abort', abort, { once: true }); tick()
  })
  function open(fixedCase?: FixedRecoveryCase) {
    live(); stop()
    const markers: FixedRecoveryMarker['event'][] = []
    let reason: RenderFailure | null = null, progress = 0, progressAfterAction = 0, actionAt: number | null = null
    const started = performance.now()
    const instance = createHost({ container: options.container, rendererUrl: options.rendererUrl, useInlineFrameStyles: false,
      startupTimeoutMs: options.startupTimeoutMs, progressTimeoutMs: 5000,
      ...(fixedCase ? { fixedRecoveryCheck: { case: fixedCase, nonce: crypto.randomUUID().replaceAll('-', '') } } : {}),
      onFixedRecoveryMarker(marker) {
        if (options.signal.aborted || markers.length >= 8) return
        markers.push(marker.event)
        if (marker.event === 'action') actionAt = performance.now()
      },
      onFailure(value) { if (!options.signal.aborted) reason = value },
      onDiagnostic(value) {
        if (options.signal.aborted || value.type !== 'progress') return
        progress++
        if (actionAt !== null && performance.now() >= actionAt) progressAfterAction++
      },
    })
    current = instance
    const frame = options.container.querySelector('iframe')!
    const observation = () => ({ reason, progress, progressAfterAction, markers: [...markers], connected: frame.isConnected,
      elapsedMs: Math.round(performance.now() - started) })
    return { instance, frame, observation }
  }
  function result(name: string, outcome: RecoveryCheckResult['outcome'], evidence: string) {
    live(); options.result({ name, outcome, evidence })
  }
  const evidence = (value: ReturnType<ReturnType<typeof open>['observation']>) =>
    `Before cleanup: markers=${value.markers.join(',') || 'none'}; failure=${value.reason ?? 'none'}; frame connected=${value.connected}; progress after action=${value.progressAfterAction}; elapsed=${value.elapsedMs}ms.`
  options.signal.addEventListener('abort', stop, { once: true })
  try {
    live()
    const missing = open('missing-ready')
    try {
      await missing.instance.ready.catch(() => {})
      live()
      const observed = missing.observation()
      result('Missing startup reply expires', observed.reason === 'startup-timeout' && !observed.connected
        && observed.markers.includes('connected') ? 'PASS' : 'FAIL', evidence(observed))
    } finally { stop() }

    let verifiedFailure = false
    for (const [fixedCase, name] of [
      ['window-message', 'Window-message spoof is ignored'],
      ['unknown-message', 'Unrecognized private-port instruction stops safely'],
      ['message-flood', 'Bounded private-port flood stops safely'],
      ['context-loss', 'Observed WebGL context loss stops safely'],
    ] as const) {
      const player = open(fixedCase)
      try {
        await player.instance.loadScene(fixedRecoveryScene(), 'preview').catch(() => {})
        live()
        await wait(() => {
          const observed = player.observation()
          return observed.reason !== null || observed.markers.includes('unsupported') || (fixedCase === 'window-message' && observed.progressAfterAction >= 2)
        }, 4000)
        const observed = player.observation()
        const unsupported = fixedCase === 'context-loss' && observed.markers.includes('unsupported')
        const passed = fixedCase === 'window-message'
          ? observed.markers.includes('action') && observed.reason === null && observed.connected && observed.progressAfterAction >= 2
          : observed.markers.includes('action') && observed.reason === 'runtime' && !observed.connected
            && (fixedCase !== 'context-loss' || observed.markers.includes('context-lost'))
        if (fixedCase === 'unknown-message') verifiedFailure = passed
        result(name, unsupported ? 'UNSUPPORTED' : passed ? 'PASS' : 'FAIL', evidence(observed))
      } finally { stop() }
    }
    const reloaded = open()
    try {
      await reloaded.instance.loadScene(fixedRecoveryScene(), 'preview')
      live()
      let observedLoad = false
      const onLoad = () => { observedLoad = true }
      reloaded.frame.addEventListener('load', onLoad, { capture: true, once: true })
      try {
        // The parent controls its own frame. The target is the same validated URL;
        // neither the child nor a user-provided field chooses a destination.
        const reloadUrl = reloaded.frame.src
        reloaded.frame.src = reloadUrl
        await wait(() => reloaded.observation().reason !== null, options.startupTimeoutMs)
        const observed = reloaded.observation()
        result('A real iframe reload stops safely', observedLoad && observed.reason === 'runtime' && !observed.connected ? 'PASS' : 'FAIL',
          `Reload load event=${observedLoad}. ${evidence(observed)}`)
      } finally { reloaded.frame.removeEventListener('load', onLoad, true) }
    } finally { stop() }

    const retry = open()
    try {
      await retry.instance.loadScene(fixedRecoveryScene(), 'preview')
      const baseline = retry.observation().progress
      await wait(() => retry.observation().progress >= baseline + 2 || retry.observation().reason !== null, 4000)
      const observed = retry.observation()
      result('A fresh player renders after an observed failure', verifiedFailure && observed.reason === null && observed.connected
        && observed.progress >= baseline + 2 ? 'PASS' : 'FAIL', `Prior failure verified=${verifiedFailure}; fresh progress=${observed.progress - baseline}. ${evidence(observed)}`)
    } finally { stop() }
  } finally { stop(); options.signal.removeEventListener('abort', stop) }
}
