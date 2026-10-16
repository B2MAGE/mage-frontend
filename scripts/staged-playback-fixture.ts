import { record, isPlaybackMessage, type PlaybackMessage } from '../src/modules/player/isolation/playbackProtocol'
import type { PlaybackLoader } from '../src/isolated-renderer/playbackEngine'

export const STAGED_SETUP = 'mage-local-staged-setup'
export const STAGED_CASES = ['compile-failure', 'first-frame-failure', 'optional-timeouts', 'obsolete-candidate', 'context-loss'] as const
export type StagedCase = typeof STAGED_CASES[number]
export type StagedSetup = { type: typeof STAGED_SETUP; case: StagedCase; nonce: string }
const MARKERS = ['armed', 'first-frame-rejected', 'candidate-held', 'candidate-released', 'context-loss-requested',
  'context-loss-unavailable', 'optional-reply-dropped'] as const
export type StagedMarker = { case: StagedCase; nonce: string; event: typeof MARKERS[number] }
export const isStagedSetup = (value: unknown): value is StagedSetup => record(value, ['type', 'case', 'nonce'])
  && value.type === STAGED_SETUP && STAGED_CASES.includes(value.case as StagedCase)
  && typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce)
export const isStagedMarker = (value: unknown): value is StagedMarker => record(value, ['case', 'nonce', 'event'])
  && isStagedSetup({ type: STAGED_SETUP, case: value.case, nonce: value.nonce }) && MARKERS.includes(value.event as StagedMarker['event'])

export const fixedStagedScene = (shader = 'color(0.45,0.2,0.8); sphere(0.7);') => ({ schemaVersion: 1, kind: 'custom', scene: {
  visualizer: { shader, scale: 1, skyboxPreset: 6 }, controls: { position0: { x: 0, y: 0, z: 4 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 },
  fx: { passOrder: ['outputPass'], passes: { outputPass: true } }, audioResponse: 'legacy',
} })

/** Only the separate loopback diagnostics build imports these fixed faults. */
export function stagedPlaybackFixture(setup: StagedSetup, evidence: MessagePort, connection: MessageEvent,
  realLoader: PlaybackLoader): { loadScene: PlaybackLoader; initialConnection: MessageEvent } {
  const mark = (event: StagedMarker['event']) => evidence.postMessage({ case: setup.case, nonce: setup.nonce, event } satisfies StagedMarker)
  const real = connection.ports[0]
  const port = {
    get onmessage() { return real.onmessage }, set onmessage(value) { real.onmessage = value },
    get onmessageerror() { return real.onmessageerror }, set onmessageerror(value) { real.onmessageerror = value },
    start: () => real.start(), close: () => { real.close(); evidence.close() },
    postMessage(data: unknown, transfer: Transferable[] = []) {
      if (setup.case === 'optional-timeouts' && isPlaybackMessage(data, ['capabilities-result', 'captured'])) {
        mark('optional-reply-dropped'); return
      }
      real.postMessage(data, transfer)
    },
  } as MessagePort
  const loadScene: PlaybackLoader = async options => {
    const engine = await realLoader(options), prepare = engine.prepareScene?.bind(engine)
    let requests = 0
    if (prepare) engine.prepareScene = async request => {
      const selected = ++requests === 1, candidate = await prepare(request)
      if (!selected) return candidate
      if (setup.case === 'first-frame-failure') {
        // Real preparation has run. Inject rejection at its first-use result
        // boundary; this is explicitly not evidence of a real GPU failure.
        candidate.discard(); mark('first-frame-rejected'); throw new Error('Fixed first-use result rejection.')
      }
      if (setup.case === 'obsolete-candidate') {
        mark('candidate-held')
        await new Promise(resolve => setTimeout(resolve, 750))
        mark('candidate-released'); return candidate
      }
      if (setup.case === 'context-loss') {
        const extension = options.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
        if (!extension) { candidate.discard(); mark('context-loss-unavailable'); throw new Error('Context-loss extension unavailable.') }
        mark('context-loss-requested'); extension.loseContext()
        return new Promise((_resolve, reject) => {
          const aborted = () => reject(new DOMException('Session disposed.', 'AbortError'))
          if (request.signal.aborted) aborted()
          else request.signal.addEventListener('abort', aborted, { once: true })
        })
      }
      return candidate
    }
    return engine
  }
  mark('armed')
  return { loadScene, initialConnection: { source: connection.source, origin: connection.origin,
    data: connection.data as PlaybackMessage<'connect'>, ports: [port] } as unknown as MessageEvent }
}
