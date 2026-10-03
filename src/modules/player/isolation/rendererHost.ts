import {
  isRendererMessage,
  RENDERER_RESPONSES,
  rendererMessage,
} from './protocol'

export type IsolatedRendererStatus = 'starting' | 'ready' | 'rendering' | 'rendered' | 'error' | 'disposed'

export interface IsolatedRendererHostOptions {
  container: HTMLElement
  rendererUrl: string
  onStatus?: (status: IsolatedRendererStatus) => void
  startupTimeoutMs?: number
  /** Disable for strict parent CSP pages that size the iframe through an external stylesheet. */
  useInlineFrameStyles?: boolean
}

export interface IsolatedRendererHost {
  renderSample: () => Promise<void>
  dispose: () => void
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_OUTPUTS_PER_SECOND = 30
export const DENIED_FEATURES = [
  'accelerometer', 'autoplay', 'camera', 'clipboard-read', 'clipboard-write',
  'display-capture', 'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope',
  'hid', 'idle-detection', 'magnetometer', 'microphone', 'midi', 'payment',
  'publickey-credentials-get', 'screen-wake-lock', 'serial', 'usb', 'web-share',
  'xr-spatial-tracking',
].map(feature => `${feature} 'none'`).join('; ')

/** Conservatively rejects shared DNS suffixes, including shared public hosting suffixes. */
export function validateRendererUrl(value: string, appHref = window.location.href): URL {
  const rendererUrl = new URL(value)
  const parentUrl = new URL(appHref)
  if (rendererUrl.username || rendererUrl.password || rendererUrl.href.includes('?') || rendererUrl.href.includes('#')) {
    throw new Error('The renderer URL must not contain credentials, query parameters, or fragments.')
  }
  const rendererHostname = rendererUrl.hostname.toLowerCase().replace(/\.$/, '')
  const parentHostname = parentUrl.hostname.toLowerCase().replace(/\.$/, '')
  const localPair = import.meta.env.DEV && ['http:', 'https:'].includes(parentUrl.protocol) && rendererUrl.protocol === parentUrl.protocol &&
    parentUrl.port === '5178' && rendererUrl.port === '5181' &&
    ((parentHostname === 'localhost' && rendererHostname === '127.0.0.1') ||
      (parentHostname === '127.0.0.1' && rendererHostname === 'localhost'))
  if (localPair) return rendererUrl

  const validDnsHost = (host: string) => host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':') &&
    host !== 'localhost' && !host.endsWith('.localhost')
  if (rendererUrl.protocol !== 'https:' || parentUrl.protocol !== 'https:' ||
    !validDnsHost(rendererHostname) || !validDnsHost(parentHostname)) {
    throw new Error('The renderer requires HTTPS on a separate public site, except for the local development pair.')
  }
  // Using only two labels deliberately rejects otherwise separate co.uk or
  // cloudfront.net sites too. Deploy under distinct dedicated site names.
  if (rendererHostname.split('.').slice(-2).join('.') === parentHostname.split('.').slice(-2).join('.')) {
    throw new Error('The renderer must use a separate site from the MAGE app.')
  }
  return rendererUrl
}

/**
 * The parent never imports MAGE or evaluates scene code. Only the fixed sample
 * command is supported here; custom scene and audio messages belong to PP-I02.
 */
export function createIsolatedRendererHost(options: IsolatedRendererHostOptions): IsolatedRendererHost {
  const rendererUrl = validateRendererUrl(options.rendererUrl)
  const requestedTimeoutMs = options.startupTimeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(requestedTimeoutMs)) throw new Error('A finite renderer startup timeout is required.')
  const timeoutMs = Math.min(30_000, Math.max(10, requestedTimeoutMs))
  if (typeof MessageChannel !== 'function' || typeof crypto.randomUUID !== 'function') {
    throw new Error('This browser does not support an isolated renderer.')
  }

  const frame = document.createElement('iframe')
  frame.title = 'Isolated scene renderer'
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.setAttribute('allow', DENIED_FEATURES)
  frame.setAttribute('tabindex', '-1')
  frame.setAttribute('credentialless', '')
  if (options.useInlineFrameStyles !== false) {
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#090b10'
  }

  let status: IsolatedRendererStatus = 'starting'
  let closed = false
  let connected = false
  let port: MessagePort | null = null
  let session = ''
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  let outputWindowStarted = performance.now()
  let outputsInWindow = 0
  let pendingRender: { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } | null = null

  function report(next: IsolatedRendererStatus) {
    status = next
    // A consumer's status callback must never prevent renderer teardown.
    try { options.onStatus?.(next) } catch { /* The boundary remains closed. */ }
  }

  function teardown(finalStatus: 'error' | 'disposed', reason: string) {
    if (closed) return
    closed = true
    clearTimeout(startupTimer)
    clearTimeout(renderTimer)
    frame.removeEventListener('load', onLoad)
    frame.removeEventListener('error', onFrameError)
    if (port) {
      try { port.postMessage(rendererMessage('dispose', session)) } catch { /* The port may already be gone. */ }
      port.onmessage = null
      port.onmessageerror = null
      port.close()
      port = null
    }
    frame.remove()
    pendingRender?.reject(new Error(reason))
    pendingRender = null
    report(finalStatus)
  }

  function fail(reason: string) {
    teardown('error', reason)
  }

  function receive(event: MessageEvent<unknown>) {
    if (closed) return
    const now = performance.now()
    if (now - outputWindowStarted >= 1_000) {
      outputWindowStarted = now
      outputsInWindow = 0
    }
    if (++outputsInWindow > MAX_OUTPUTS_PER_SECOND) {
      fail('The renderer sent too many messages.')
      return
    }
    if (!isRendererMessage(event.data, RENDERER_RESPONSES)) {
      fail('The renderer sent an invalid response.')
      return
    }
    const message = event.data
    if (message.session !== session) return
    if (message.type === 'error' || message.type === 'disposed') {
      fail('The isolated renderer stopped.')
      return
    }
    if (message.type === 'ready') {
      if (status !== 'starting') {
        fail('The renderer sent an unexpected readiness response.')
        return
      }
      clearTimeout(startupTimer)
      report('ready')
      return
    }
    if (message.type === 'rendered') {
      if (status !== 'rendering' || !pendingRender) {
        fail('The renderer sent an unexpected completion response.')
        return
      }
      clearTimeout(renderTimer)
      pendingRender.resolve()
      pendingRender = null
      report('rendered')
    }
  }

  function onFrameError() {
    fail('The isolated renderer could not be loaded.')
  }

  function onLoad() {
    if (closed) return
    if (connected) {
      fail('The isolated renderer navigated away.')
      return
    }
    connected = true
    const childWindow = frame.contentWindow
    if (!childWindow) {
      fail('The isolated renderer has no window.')
      return
    }
    session = crypto.randomUUID()
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = receive
    port.onmessageerror = () => fail('The renderer response could not be decoded.')
    port.start()
    try {
      // allow-scripts without allow-same-origin gives the child an opaque origin.
      // No secret or scene payload crosses this initial window message.
      childWindow.postMessage(rendererMessage('connect', session), '*', [channel.port2])
    } catch {
      channel.port2.close()
      fail('The isolated renderer could not be connected.')
    }
  }

  frame.addEventListener('load', onLoad)
  frame.addEventListener('error', onFrameError)
  frame.src = rendererUrl.href
  const startupTimer = setTimeout(() => fail('The isolated renderer did not become ready.'), timeoutMs)
  report('starting')
  options.container.append(frame)

  return {
    renderSample() {
      if (closed) return Promise.reject(new Error('The isolated renderer has been disposed.'))
      if (pendingRender) return pendingRender.promise
      if ((status !== 'ready' && status !== 'rendered') || !port) {
        return Promise.reject(new Error('The isolated renderer is not ready.'))
      }
      let resolve!: () => void
      let reject!: (error: Error) => void
      const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
      pendingRender = { promise, resolve, reject }
      renderTimer = setTimeout(() => fail('The isolated renderer did not complete rendering.'), DEFAULT_TIMEOUT_MS)
      report('rendering')
      try { port.postMessage(rendererMessage('render-sample', session)) } catch {
        fail('The isolated renderer could not receive a command.')
      }
      return promise
    },
    dispose() {
      teardown('disposed', 'The isolated renderer was disposed.')
    },
  }
}
