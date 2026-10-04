// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderSecurityCheckDocument } from '../deployment/isolated-renderer/security-check-page.mjs'
import { mountIsolatedSecurityCheck } from './isolated-security-ui'
import { createIsolatedPlaybackHost } from '../src/modules/player/isolation/playbackHost'

vi.mock('../src/modules/player/isolation/playbackHost', () => ({ createIsolatedPlaybackHost: vi.fn() }))

let dom: JSDOM | undefined
afterEach(() => { dom?.window.document?.getElementById('stop')?.click(); dom?.window.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

function open(url = 'https://mage.peterbucci.com/player-check/security/') {
    dom = new JSDOM(renderSecurityCheckDocument({ scriptPath: 'assets/security-test.js', scriptIntegrity: `sha384-${'a'.repeat(64)}`,
      stylePath: 'assets/security-test.css', styleIntegrity: `sha384-${'b'.repeat(64)}` }), { url, pretendToBeVisual: true })
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('location', dom.window.location); vi.stubGlobal('navigator', dom.window.navigator)
    mountIsolatedSecurityCheck('deployed')
    return dom.window.document
}

describe('fixed deployed security page initialization', () => {
  it('enables fixed groups only after matching the deployed page without starting a player', () => {
    const page = open('https://mage.peterbucci.com/player-check/security/')
    for (const id of ['boundary', 'failures', 'stall']) expect((page.getElementById(id) as HTMLButtonElement).disabled).toBe(false)
    expect(page.querySelector('iframe')).toBeNull()
    expect((page.getElementById('download') as HTMLButtonElement).disabled).toBe(true)
    expect(page.getElementById('status')?.textContent).toContain('Ready.')
  })
  it('leaves all groups disabled on another site or an address with configuration-like query input', () => {
    for (const url of ['https://other.example/player-check/security/', 'https://mage.peterbucci.com/player-check/security/?renderer=other']) {
      const page = open(url)
      for (const id of ['boundary', 'failures', 'stall']) expect((page.getElementById(id) as HTMLButtonElement).disabled).toBe(true)
      expect(page.querySelector('iframe')).toBeNull()
      dom?.window.close()
    }
  })
})

describe('bounded stall evidence and cancellation', () => {
  function fixture() {
    vi.useFakeTimers()
    const players: Array<{ frame: HTMLIFrameElement; source: Window; nonce: string; fail: () => void }> = []
    vi.mocked(createIsolatedPlaybackHost).mockImplementation(options => {
      const frame = document.createElement('iframe')
      options.container.append(frame)
      const item = { frame, source: frame.contentWindow!, nonce: '', fail: () => { frame.remove(); options.onFailure?.('progress-timeout') } }
      players.push(item)
      options.onDiagnostic?.({ type: 'status', status: 'starting', at: performance.now() })
      return { ready: Promise.resolve(), dispose() { frame.remove() }, async loadScene(value: unknown) {
        const shader = (value as { visualizer: { shader: string } }).visualizer.shader
        item.nonce = shader.match(/nonce:"([a-f0-9]{32})"/)?.[1] ?? ''
        options.onDiagnostic?.({ type: 'status', status: 'playing', at: performance.now() })
      } } as ReturnType<typeof createIsolatedPlaybackHost>
    })
    const page = open()
    const send = (player: typeof players[number], marker: string, extra: Record<string, unknown> = {}, source = player.source, origin = 'null') => {
      window.dispatchEvent(new dom!.window.MessageEvent('message', { source, origin,
        data: { type: 'mage-isolation-stall', nonce: player.nonce, marker, atMs: 150, ...extra } }))
    }
    const snapshot = () => {
      const output = page.getElementById('report-json')!
      if (!output.hidden) page.getElementById('show-report')!.click()
      page.getElementById('show-report')!.click()
      return JSON.parse(output.textContent!)
    }
    page.getElementById('stall')!.click()
    return { page, players, send, snapshot }
  }

  it('separately times the baseline and does not relabel scheduling as loop execution', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    expect(f.players).toHaveLength(2)
    f.send(f.players[1], 'queued'); f.send(f.players[1], 'scheduled')
    f.send(f.players[1], 'start', {}, f.players[0].source)
    f.send(f.players[1], 'start', {}, f.players[1].source, 'https://other.example')
    f.send(f.players[1], 'start', { nonce: 'f'.repeat(32) })
    f.send(f.players[1], 'start', { account: 'excluded' })
    await vi.advanceTimersByTimeAsync(3600)
    f.players[1].fail()
    await vi.advanceTimersByTimeAsync(1200)
    const run = f.snapshot().runs[0]
    expect(run.checks.map((check: { outcome: string }) => check.outcome)).toEqual(['FAIL', 'PASS'])
    expect(run.stall.baseline.elapsedMs).toBe(1200)
    expect(run.stall.observation.elapsedMs).toBe(3600)
    expect(run.stall.observation.markerStarted).toBe(false)
    expect(run.stall.observation.failureReason).toBeNull()
    expect(run.stall.observation.iframeConnected).toBe(true)
    expect(run.stall.recovery.failureReason).toBe('progress-timeout')
    expect(run.stall.beforeCleanup.iframeConnected).toBe(false)
    expect(run.diagnostics.events.filter((event: { type: string }) => event.type === 'marker').map((event: { marker: string }) => event.marker)).toEqual(['queued', 'scheduled'])
  })

  it('passes the scheduled probe without claiming loop execution when teardown discards start/end markers', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    f.send(f.players[1], 'queued'); f.send(f.players[1], 'scheduled')
    await vi.advanceTimersByTimeAsync(1000)
    f.players[1].fail()
    await vi.advanceTimersByTimeAsync(3800)
    const run = f.snapshot().runs[0]
    expect(run.checks.map((check: { outcome: string }) => check.outcome)).toEqual(['PASS', 'PASS'])
    expect(run.checks.map((check: { name: string }) => check.name)).toEqual([
      'Player is removed during the scheduled CPU probe', 'Parent remains responsive during the scheduled CPU probe'])
    expect(run.checks.every((check: { evidence: string }) => check.evidence.includes('Scheduling alone does not prove loop execution.'))).toBe(true)
    expect(run.stall.observation.elapsedMs).toBe(3600)
    expect(run.stall.observation.markerScheduled).toBe(true)
    expect(run.stall.observation.markerStarted).toBe(false)
    expect(run.stall.observation.markerEnded).toBe(false)
    expect(run.stall.observation.failureReason).toBe('progress-timeout')
    expect(run.stall.observation.iframeConnected).toBe(false)
  })

  it('requires scheduling evidence even when an independently mocked start/end arrives', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    f.send(f.players[1], 'queued'); f.send(f.players[1], 'start'); f.send(f.players[1], 'end')
    f.players[1].fail()
    await vi.advanceTimersByTimeAsync(4800)
    const run = f.snapshot().runs[0]
    expect(run.checks.map((check: { outcome: string }) => check.outcome)).toEqual(['FAIL', 'FAIL'])
    expect(run.stall.observation.markerScheduled).toBe(false)
    expect(run.stall.observation.iframeConnected).toBe(false)
    expect(run.stall.observation.maxParentGapMs).toBeLessThan(1000)
  })

  it('freezes the original verdict and connected-frame evidence before explicit cleanup', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    for (const marker of ['queued', 'scheduled', 'start', 'end', 'start']) f.send(f.players[1], marker)
    await vi.advanceTimersByTimeAsync(4800)
    const run = f.snapshot().runs[0]
    expect(run.checks.map((check: { outcome: string }) => check.outcome)).toEqual(['FAIL', 'PASS'])
    expect(run.stall.beforeCleanup.iframeConnected).toBe(true)
    expect(run.stall.beforeCleanup.failureReason).toBeNull()
    expect(f.players[1].frame.isConnected).toBe(false)
    expect(run.diagnostics.events.filter((event: { type: string }) => event.type === 'marker')).toHaveLength(4)
  })

  it('keeps a large parent delay failed even when the recovery window is responsive', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    f.send(f.players[1], 'scheduled'); f.send(f.players[1], 'start')
    const clock = performance.now.bind(performance)
    const delayedClock = vi.spyOn(performance, 'now').mockImplementation(() => clock() + 3807)
    await vi.advanceTimersByTimeAsync(4800)
    const run = f.snapshot().runs[0]
    expect(run.checks[1].outcome).toBe('FAIL')
    expect(run.stall.observation.maxParentGapMs).toBeGreaterThanOrEqual(3807)
    expect(run.stall.recovery.maxParentGapMs).toBeLessThan(1000)
    expect(run.stall.baseline.maxParentGapMs).toBeLessThan(1000)
    delayedClock.mockRestore()
  })

  it('stops timers and rejects earlier-run markers after starting another run', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    const old = f.players[1]
    f.send(old, 'queued')
    f.page.getElementById('stop')!.click()
    expect(vi.getTimerCount()).toBe(0)
    f.page.getElementById('stall')!.click()
    await vi.advanceTimersByTimeAsync(1200)
    const next = f.players[3]
    f.send(next, 'start', {}, old.source)
    f.send(next, 'start', { nonce: old.nonce })
    await vi.advanceTimersByTimeAsync(4800)
    const runs = f.snapshot().runs
    expect(runs[0].status).toBe('cancelled')
    expect(runs[0].stall.beforeCleanup.iframeConnected).toBe(true)
    expect(runs[0].diagnostics.events.filter((event: { type: string }) => event.type === 'marker')).toHaveLength(1)
    expect(runs[1].stall.observation.markerStarted).toBe(false)
    expect(runs[1].diagnostics.events.filter((event: { type: string }) => event.type === 'marker')).toHaveLength(0)
  })

  it('retains hidden-page interruption even when both fixed verdicts pass', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(1200)
    f.send(f.players[1], 'scheduled'); f.send(f.players[1], 'start')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new dom!.window.Event('visibilitychange'))
    f.players[1].fail()
    await vi.advanceTimersByTimeAsync(4800)
    const run = f.snapshot().runs[0]
    expect(run.checks.map((check: { outcome: string }) => check.outcome)).toEqual(['PASS', 'PASS'])
    expect(run.interruptedByHiddenPage).toBe(true)
    expect(run.status).toBe('failed')
    expect(run.diagnostics.events.some((event: { type: string; state: string }) => event.type === 'visibility' && event.state === 'hidden')).toBe(true)
  })
})
