import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedRendererHost, validateRendererUrl } from './rendererHost'
import { rendererMessage, type RendererMessageType } from './protocol'

const SESSION = 'ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
const STALE_SESSION = '151b6502-eecf-42c2-88bb-1a85f91db27c'
const RENDERER_URL = 'http://127.0.0.1:5181/'

class TestPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  start = vi.fn()
  close = vi.fn()
  receive(data: unknown) { this.onmessage?.({ data } as MessageEvent<unknown>) }
}

const channels: Array<{ port1: TestPort; port2: TestPort }> = []

function setup() {
  const container = document.createElement('div')
  document.body.append(container)
  const onStatus = vi.fn()
  const host = createIsolatedRendererHost({ container, rendererUrl: RENDERER_URL, onStatus, startupTimeoutMs: 100 })
  const frame = container.querySelector('iframe')!
  const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  const load = () => frame.dispatchEvent(new Event('load'))
  const reply = (type: RendererMessageType, session = SESSION) => channels.at(-1)!.port1.receive(rendererMessage(type, session))
  return { container, onStatus, host, frame, postMessage, load, reply }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', true)
  vi.stubGlobal('window', { location: { href: 'http://localhost:5178/' } })
  vi.stubGlobal('MessageChannel', class {
    port1 = new TestPort()
    port2 = new TestPort()
    constructor() { channels.push(this) }
  })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(SESSION)
  channels.length = 0
})

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isolated renderer endpoint validation', () => {
  it('permits only opposite local hosts on the dedicated development ports', () => {
    expect(validateRendererUrl(RENDERER_URL).origin).toBe('http://127.0.0.1:5181')
    expect(validateRendererUrl('http://localhost:5181/', 'http://127.0.0.1:5178/').hostname).toBe('localhost')
    expect(() => validateRendererUrl('http://localhost:5181/')).toThrow(/separate public site/)
    expect(() => validateRendererUrl('http://127.0.0.1:5182/')).toThrow()
    expect(() => validateRendererUrl('http://127.0.0.1:5181/', 'http://localhost:5179/')).toThrow()
    expect(() => validateRendererUrl('http://[::1]:5181/')).toThrow()
  })

  it('supports matching local HTTPS for deployment parity without admitting mixed protocols', () => {
    expect(validateRendererUrl('https://127.0.0.1:5181/', 'https://localhost:5178/').origin).toBe('https://127.0.0.1:5181')
    expect(validateRendererUrl('https://localhost:5181/', 'https://127.0.0.1:5178/').origin).toBe('https://localhost:5181')
    expect(() => validateRendererUrl('https://localhost:5181/', 'https://localhost:5178/')).toThrow()
    expect(() => validateRendererUrl('https://127.0.0.1:5181/', 'http://localhost:5178/')).toThrow()
    expect(() => validateRendererUrl('http://127.0.0.1:5181/', 'https://localhost:5178/')).toThrow()
    vi.stubEnv('DEV', false)
    expect(() => validateRendererUrl('https://127.0.0.1:5181/', 'https://localhost:5178/')).toThrow()
    expect(() => validateRendererUrl('https://localhost:5181/', 'https://127.0.0.1:5178/')).toThrow()
  })

  it('requires distinct HTTPS sites in production, conservatively rejecting shared suffixes', () => {
    vi.stubEnv('DEV', false)
    const parent = 'https://app.mage.example/'
    expect(validateRendererUrl('https://player.mage-render.example/', parent).origin).toBe('https://player.mage-render.example')
    for (const url of [
      'https://app.mage.example/', 'https://renderer.mage.example/',
      'https://child.app.mage.example/', 'https://mage.example/',
      'http://renderer.other.example/', 'https://127.0.0.1/',
      'https://localhost/', 'https://renderer.localhost/', 'https://[::1]/',
      'http://127.0.0.1:5181/',
    ]) expect(() => validateRendererUrl(url, parent)).toThrow()
    expect(() => validateRendererUrl('https://player.example.co.uk/', 'https://app.other.co.uk/')).toThrow()
    expect(() => validateRendererUrl('https://second.cloudfront.net/', 'https://first.cloudfront.net/')).toThrow()
    expect(() => validateRendererUrl('https://renderer.mage.example./', parent)).toThrow()
    expect(() => validateRendererUrl(RENDERER_URL)).toThrow()
  })

  it('accepts a provider-issued CloudFront address for MAGE without allowing sibling app domains', () => {
    vi.stubEnv('DEV', false)
    const parent = 'https://mage.peterbucci.com/'
    expect(validateRendererUrl('https://d111111abcdef8.cloudfront.net/index.html', parent).origin)
      .toBe('https://d111111abcdef8.cloudfront.net')
    expect(() => validateRendererUrl('https://player.peterbucci.com/', parent)).toThrow(/separate site/)
  })

  it.each([
    '/renderer', '//127.0.0.1:5181/',
    'http://user:password@127.0.0.1:5181/', 'http://127.0.0.1:5181/?token=secret',
    'http://127.0.0.1:5181/#data', 'http://127.0.0.1:5181/?',
    'http://127.0.0.1:5181/#', 'javascript:alert(1)', 'data:text/html,hi',
  ])('rejects relative, credentialed, payload-bearing, or executable endpoints: %s', value => {
    expect(() => validateRendererUrl(value)).toThrow()
  })
})

describe('isolated renderer host', () => {
  it('can use an external parent stylesheet without inserting a CSP-blocked style attribute', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const host = createIsolatedRendererHost({ container, rendererUrl: RENDERER_URL, useInlineFrameStyles: false })
    expect(container.querySelector('iframe')!.hasAttribute('style')).toBe(false)
    host.dispose()
  })

  it('creates a scripts-only, opaque, credentialless child and binds its fresh session to a dedicated port', () => {
    const { frame, postMessage, host, load, onStatus } = setup()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.hasAttribute('credentialless')).toBe(true)
    expect(frame.getAttribute('allow')).toContain("microphone 'none'")
    expect(frame.getAttribute('allow')).toContain("camera 'none'")
    expect(frame.getAttribute('allow')).toContain("fullscreen 'none'")
    expect(frame.src).toBe(RENDERER_URL)
    expect(channels).toHaveLength(0)
    load()
    expect(crypto.randomUUID).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith(rendererMessage('connect', SESSION), '*', [channels[0].port2])
    expect(channels[0].port1.start).toHaveBeenCalledOnce()
    expect(onStatus).toHaveBeenLastCalledWith('starting')
    host.dispose()
  })

  it('renders only the fixed sample after readiness and resolves only after completion on its session', async () => {
    const { host, load, reply, onStatus } = setup()
    await expect(host.renderSample()).rejects.toThrow(/not ready/)
    load()
    reply('ready', STALE_SESSION)
    expect(onStatus).toHaveBeenLastCalledWith('starting')
    reply('ready')
    const rendered = host.renderSample()
    expect(host.renderSample()).toBe(rendered)
    expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith(rendererMessage('render-sample', SESSION))
    expect(onStatus).toHaveBeenLastCalledWith('rendering')
    reply('rendered', STALE_SESSION)
    expect(onStatus).toHaveBeenLastCalledWith('rendering')
    reply('rendered')
    await expect(rendered).resolves.toBeUndefined()
    expect(onStatus).toHaveBeenLastCalledWith('rendered')
    const secondRender = host.renderSample()
    reply('rendered')
    await secondRender
    host.dispose()
  })

  it.each([
    null, {}, 'ready',
    { ...rendererMessage('ready', SESSION), version: 2 },
    { ...rendererMessage('ready', SESSION), protocol: 'other' },
    { ...rendererMessage('ready', SESSION), source: 'untrusted code' },
    rendererMessage('render-sample', SESSION),
  ])('tears down on malformed or wrong-direction child output without accepting it: %j', data => {
    const { load, frame, onStatus, host } = setup()
    load()
    channels[0].port1.receive(data)
    expect(frame.isConnected).toBe(false)
    expect(onStatus).toHaveBeenLastCalledWith('error')
    expect(channels[0].port1.close).toHaveBeenCalledOnce()
    host.dispose()
    expect(onStatus).toHaveBeenLastCalledWith('error')
  })

  it.each(['ready', 'rendered', 'error', 'disposed'] as const)('closes unexpected child state %s', type => {
    const { load, reply, frame, onStatus } = setup()
    load()
    if (type === 'ready') reply('ready')
    reply(type)
    expect(frame.isConnected).toBe(false)
    expect(onStatus).toHaveBeenLastCalledWith('error')
  })

  it('cancels a pending render, closes its port, and ignores queued replies on disposal', async () => {
    const { host, load, reply, frame, onStatus } = setup()
    load()
    reply('ready')
    const render = host.renderSample()
    const rejection = expect(render).rejects.toThrow(/disposed/)
    const queuedReceive = channels[0].port1.onmessage!
    host.dispose()
    await rejection
    expect(channels[0].port1.postMessage).toHaveBeenLastCalledWith(rendererMessage('dispose', SESSION))
    expect(channels[0].port1.close).toHaveBeenCalledOnce()
    expect(channels[0].port1.onmessage).toBeNull()
    expect(channels[0].port1.onmessageerror).toBeNull()
    expect(frame.isConnected).toBe(false)
    queuedReceive({ data: rendererMessage('rendered', SESSION) } as MessageEvent)
    vi.advanceTimersByTime(30_000)
    expect(onStatus).toHaveBeenLastCalledWith('disposed')
    host.dispose()
    expect(channels[0].port1.close).toHaveBeenCalledOnce()
    await expect(host.renderSample()).rejects.toThrow(/disposed/)
  })

  it('removes a frame disposed before its first load without connecting it later', () => {
    const { host, load, frame, onStatus } = setup()
    host.dispose()
    load()
    vi.advanceTimersByTime(30_000)
    expect(channels).toHaveLength(0)
    expect(frame.isConnected).toBe(false)
    expect(onStatus).toHaveBeenLastCalledWith('disposed')
  })

  it('tears down on a second navigation without creating another session', async () => {
    const { host, load, reply, frame, onStatus } = setup()
    load()
    reply('ready')
    const rendering = host.renderSample()
    const rejection = expect(rendering).rejects.toThrow(/navigated/)
    load()
    await rejection
    expect(frame.isConnected).toBe(false)
    expect(channels).toHaveLength(1)
    expect(crypto.randomUUID).toHaveBeenCalledOnce()
    expect(onStatus).toHaveBeenLastCalledWith('error')
  })

  it('bounds startup and rendering waits and never replaces the frame with a parent canvas', async () => {
    const startup = setup()
    vi.advanceTimersByTime(100)
    expect(startup.frame.isConnected).toBe(false)
    expect(startup.onStatus).toHaveBeenLastCalledWith('error')
    const rendering = setup()
    rendering.load()
    rendering.reply('ready')
    const render = rendering.host.renderSample()
    const rejection = expect(render).rejects.toThrow(/did not complete/)
    vi.advanceTimersByTime(10_000)
    await rejection
    expect(rendering.frame.isConnected).toBe(false)
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('fails closed on undecodable output and excessive stale output', () => {
    const undecodable = setup()
    undecodable.load()
    channels[0].port1.onmessageerror!()
    expect(undecodable.frame.isConnected).toBe(false)
    const flooding = setup()
    flooding.load()
    for (let index = 0; index < 31; index += 1) flooding.reply('ready', STALE_SESSION)
    expect(flooding.frame.isConnected).toBe(false)
    expect(flooding.onStatus).toHaveBeenLastCalledWith('error')
  })

  it('closes both ends if transferring the port fails', () => {
    const { load, postMessage, frame, onStatus } = setup()
    postMessage.mockImplementation(() => { throw new DOMException('Clone failed', 'DataCloneError') })
    load()
    expect(channels[0].port1.close).toHaveBeenCalledOnce()
    expect(channels[0].port2.close).toHaveBeenCalledOnce()
    expect(frame.isConnected).toBe(false)
    expect(onStatus).toHaveBeenLastCalledWith('error')
  })

  it('stays closed even if the consumer status callback throws', () => {
    const { load, frame, onStatus } = setup()
    onStatus.mockImplementation(() => { throw new Error('Consumer failed') })
    load()
    channels[0].port1.onmessageerror!()
    expect(frame.isConnected).toBe(false)
    expect(channels[0].port1.close).toHaveBeenCalledOnce()
  })

  it('does not create a frame when channel support or endpoint validation fails', () => {
    const container = document.createElement('div')
    vi.stubGlobal('MessageChannel', undefined)
    expect(() => createIsolatedRendererHost({ container, rendererUrl: RENDERER_URL })).toThrow(/does not support/)
    expect(container.children).toHaveLength(0)
    expect(() => createIsolatedRendererHost({ container, rendererUrl: 'https://localhost/' })).toThrow()
    expect(container.children).toHaveLength(0)
  })
})
