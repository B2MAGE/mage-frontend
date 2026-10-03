import { afterEach, describe, expect, it, vi } from 'vitest'
import { installRendererRuntime } from './runtime'
import { rendererMessage } from '../modules/player/isolation/protocol'

const parentOrigin = 'http://127.0.0.1:5178'
const session = '4b50667d-27d8-4634-93e8-3a795e110123'
const disposers: (() => void)[] = []
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks() })

function fixture(topLevel = false) {
  const parent = {} as Window
  const events = new EventTarget()
  const target = Object.assign(events, { parent, }) as unknown as Window
  if (topLevel) Object.assign(target, { parent: target })
  const canvas = document.createElement('canvas')
  const statusElement = document.createElement('p')
  const release = vi.fn()
  const loadSample = vi.fn().mockResolvedValue(release)
  const runtime = installRendererRuntime({ canvas, statusElement, allowedParentOrigins: [parentOrigin], loadSample, targetWindow: target })
  disposers.push(runtime.dispose)
  const port = { postMessage: vi.fn(), start: vi.fn(), close: vi.fn(), onmessage: null as null | ((event: MessageEvent) => void), onmessageerror: null as null | (() => void) }
  function bootstrap(overrides: Partial<MessageEventInit> = {}) {
    target.dispatchEvent(new MessageEvent('message', { data: rendererMessage('connect', session), origin: parentOrigin,
      source: parent, ports: [port as unknown as MessagePort], ...overrides }))
  }
  const send = (type: 'render-sample' | 'dispose') => port.onmessage?.(new MessageEvent('message', { data: rendererMessage(type, session) }))
  return { runtime, bootstrap, port, parent, loadSample, release, statusElement, send, target }
}

describe('isolated renderer child', () => {
  it.each(['wrong-source', 'wrong-origin', 'null-origin', 'unknown-fields', 'missing-port', 'top-level'])('ignores %s before any engine allocation', failure => {
    const f = fixture(failure === 'top-level')
    f.bootstrap(failure === 'wrong-source' ? { source: {} as Window } : failure === 'wrong-origin' ? { origin: 'https://evil.example' }
      : failure === 'null-origin' ? { origin: 'null' } : failure === 'unknown-fields' ? { data: { ...rendererMessage('connect', session), source: 'sphere(1)' } }
        : failure === 'missing-port' ? { ports: [] } : {})
    expect(f.port.start).not.toHaveBeenCalled()
    expect(f.loadSample).not.toHaveBeenCalled()
  })
  it('binds one parent session and renders only after a command on its private port', async () => {
    const f = fixture()
    f.bootstrap()
    expect(f.port.postMessage).toHaveBeenCalledWith(rendererMessage('ready', session))
    expect(f.loadSample).not.toHaveBeenCalled()
    f.target.dispatchEvent(new MessageEvent('message', { data: rendererMessage('render-sample', session), source: f.parent, origin: parentOrigin }))
    expect(f.loadSample).not.toHaveBeenCalled()
    f.send('render-sample')
    await Promise.resolve()
    expect(f.loadSample).toHaveBeenCalledTimes(1)
    expect(f.port.postMessage).toHaveBeenCalledWith(rendererMessage('rendered', session))
    f.send('dispose')
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.port.close).toHaveBeenCalledOnce()
  })
  it('does not retain a sample that finishes after disposal', async () => {
    const f = fixture()
    let complete!: (release: () => void) => void
    f.loadSample.mockReturnValue(new Promise(resolve => { complete = resolve }))
    f.bootstrap(); f.send('render-sample'); f.runtime.dispose(); complete(f.release)
    await Promise.resolve()
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.port.postMessage).not.toHaveBeenCalledWith(rendererMessage('rendered', session))
  })
  it('fails closed on source-bearing commands or channel errors', () => {
    const f = fixture(); f.bootstrap()
    f.port.onmessage?.(new MessageEvent('message', { data: { ...rendererMessage('render-sample', session), source: 'sphere(1)' } }))
    expect(f.loadSample).not.toHaveBeenCalled()
    expect(f.port.close).toHaveBeenCalledOnce()
    expect(f.statusElement.textContent).toBe('This scene could not be displayed.')
  })
  it('ignores stale sessions, limits command bursts, and closes on page exit', async () => {
    const f = fixture(); f.bootstrap()
    f.port.onmessage?.(new MessageEvent('message', { data: rendererMessage('render-sample', '1'.repeat(32)) }))
    expect(f.loadSample).not.toHaveBeenCalled()
    f.send('render-sample'); await Promise.resolve()
    for (let i = 0; i < 10; i++) f.send('render-sample')
    expect(f.release).toHaveBeenCalledOnce()
    const next = fixture(); next.bootstrap(); next.target.dispatchEvent(new Event('pagehide'))
    expect(next.port.close).toHaveBeenCalledOnce()
  })
  it('releases an active sample after a later renderer failure', async () => {
    const f = fixture(); f.bootstrap(); f.send('render-sample'); await Promise.resolve()
    const onError = f.loadSample.mock.calls[0][2] as () => void
    onError()
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.port.postMessage).toHaveBeenCalledWith(rendererMessage('error', session))
  })
})
