import { createIsolatedPlayer, type IsolatedPlayer } from '../isolatedPlayer'
import { hasVerifiedParentBoundary } from './boundaryCheck'
import { createTestRhythm } from './testRhythm'

const controlIds = ['switch', 'pause', 'reset', 'test-audio', 'clear', 'audio', 'simulate', 'response', 'volume', 'seek', 'capture-button']

function fixedScene(alternate: boolean, response: string) {
  return { schemaVersion: 1, kind: 'custom', scene: {
    visualizer: { skyboxPreset: 6, scale: 1, shader: `let size = input(); let pointerDown = input();
setMaxIterations(80); setStepSize(0.7); rotateY(time * 0.4); rotateX(mouse.y * 0.4 + 0.35);
color(${alternate ? '0.12,0.7,0.65' : '0.45,0.16,0.9'}); ${alternate ? 'sphere(0.55 + size * 0.18 + pointerDown * 0.15);' : 'torus(0.7 + size * 0.15,0.16 + pointerDown * 0.1);'}` },
    controls: { target0: { x: 0, y: 0, z: 0 }, position0: { x: 0, y: 0, z: 4.5 }, zoom0: 1 },
    intent: { time_multiplier: 0.5, autoRotate: false, fov: 50, base_speed: 0.2,
      minimizing_factor: 0.8, power_factor: 8, pointerDownMultiplier: 1, easing_speed: 0.6 },
    fx: { passOrder: ['bloom', 'outputPass'], bloom: { enabled: false }, passes: { outputPass: true } },
    audioResponse: response === 'legacy' ? 'legacy' : 'mapped-v1',
    audioResponseConfig: { version: 1, sensitivity: 1, mappings: [{ target: 'size', source: 'bass-hit', amount: 0.8, attack: 0.02, release: 0.35 }] },
  } }
}

export function mountLiveMusicCheck(options: { parentOrigin: string; rendererUrl: string }, dependencies: {
  createPlayer?: typeof createIsolatedPlayer
  verifyBoundary?: typeof hasVerifiedParentBoundary
} = {}) {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const button = (id: string) => element<HTMLButtonElement>(id)
  const container = element('player'), status = element('status')
  const captureImage = element<HTMLImageElement>('capture')
  const verifyBoundary = dependencies.verifyBoundary ?? hasVerifiedParentBoundary
  const listeners: Array<() => void> = []
  let player: IsolatedPlayer | null = null
  let generation = 0, alternate = false, paused = false, stopped = false
  let captureUrl: string | null = null
  let audioLoading = false, sceneLoading = false, capturePending = false
  element('address').textContent = options.rendererUrl

  function listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler)
    listeners.push(() => target.removeEventListener(event, handler))
  }
  function enable(yes: boolean) {
    for (const id of controlIds) (element(id) as HTMLInputElement).disabled = !yes
    button('start').disabled = yes
    button('stop').disabled = !yes
    button('unavailable').disabled = false
  }
  function clearCapture() {
    captureImage.removeAttribute('src')
    captureImage.hidden = true
    if (captureUrl) URL.revokeObjectURL(captureUrl)
    captureUrl = null
  }
  function stop() {
    generation++
    player?.dispose()
    player = null
    audioLoading = false
    sceneLoading = false
    capturePending = false
    clearCapture()
    element<HTMLInputElement>('audio').value = ''
    enable(false)
    element('audio-status').textContent = 'No music loaded.'
    element('stop-result').textContent = !container.querySelector('iframe') ? 'Stop: player removed and audio released.' : 'Stop: could not confirm removal.'
    status.textContent = 'Player stopped and removed.'
  }
  async function action(run: (active: IsolatedPlayer) => void | Promise<unknown>) {
    const active = player, current = generation
    if (!active) return
    try { await run(active) } catch (error) {
      if (current === generation) status.textContent = error instanceof Error ? error.message : 'The player could not complete this action.'
    }
  }
  async function launch(unavailable = false) {
    stop()
    const current = generation
    let failed = false
    button('start').disabled = true
    button('stop').disabled = false
    button('unavailable').disabled = true
    element('boundary').textContent = 'Isolation: waiting for the player.'
    const url = new URL(options.rendererUrl)
    if (unavailable) url.pathname = '/unavailable.html'
    try {
      const next = (dependencies.createPlayer ?? createIsolatedPlayer)({
        container, rendererUrl: url.href, profile: 'preview', wheelZoom: true, useInlineFrameStyles: false,
        onStatus(state) {
          if (current === generation) status.textContent = state === 'playing' ? 'Scene running. Choose music or play the test rhythm.' : `Player: ${state}.`
        },
        onFailure() {
          if (current !== generation) return
          failed = true
          stop()
          button('start').textContent = 'Retry player'
          status.textContent = 'The player stopped safely. Start it again to retry.'
          if (unavailable) element('retry-result').textContent = !container.querySelector('iframe')
            ? 'Unavailable player: failed safely and was removed. Retry to reconnect.' : 'Unavailable player: could not confirm removal.'
        },
      })
      player = next
      await next.ready
      if (current !== generation || failed) return
      await next.loadScene(fixedScene(alternate, element<HTMLSelectElement>('response').value))
      if (current !== generation || failed) return
      if (!verifyBoundary(container.querySelector('iframe'))) throw new Error('Isolation could not be verified. The player was removed.')
      next.setVolume(Number(element<HTMLInputElement>('volume').value))
      next.setSynthetic(element<HTMLInputElement>('simulate').checked, 17, 1)
      paused = false
      button('pause').textContent = 'Pause'
      button('start').textContent = 'Start player'
      element('boundary').textContent = 'Isolation verified: this page cannot access the separate player document.'
      element('retry-result').textContent = 'Connection: player ready. Music and controls are available.'
      enable(true)
    } catch (error) {
      if (current !== generation || failed) return
      player?.dispose()
      player = null
      enable(false)
      status.textContent = error instanceof Error ? error.message : 'The player could not start.'
      button('start').textContent = 'Retry player'
    }
  }
  async function loadScene(switchShape: boolean) {
    if (sceneLoading) return
    sceneLoading = true
    button('switch').disabled = true
    element<HTMLSelectElement>('response').disabled = true
    const current = generation
    await action(async active => {
      if (switchShape) alternate = !alternate
      await active.loadScene(fixedScene(alternate, element<HTMLSelectElement>('response').value))
    })
    if (current === generation && player) {
      sceneLoading = false
      button('switch').disabled = false
      element<HTMLSelectElement>('response').disabled = false
    }
  }
  async function loadAudio(blob: Blob, forcePlay: boolean) {
    if (audioLoading) return
    audioLoading = true
    button('test-audio').disabled = true
    element<HTMLInputElement>('audio').disabled = true
    const current = generation
    await action(async active => {
      await active.loadAudio(blob)
      if (current !== generation) return
      if (forcePlay) {
        await active.play()
        if (current !== generation) return
        paused = false
        button('pause').textContent = 'Pause'
      }
    })
    if (current === generation && player) {
      audioLoading = false
      button('test-audio').disabled = false
      element<HTMLInputElement>('audio').disabled = false
    }
  }
  if (window.location.origin !== options.parentOrigin) {
    status.textContent = `Open this check from ${options.parentOrigin}/player-check/ to test the live deployment.`
    return () => {}
  }
  enable(false)
  status.textContent = 'Ready. Start the player, then play the test rhythm or choose a local audio file.'
  listen(button('start'), 'click', () => { void launch() })
  listen(button('unavailable'), 'click', () => { void launch(true) })
  listen(button('stop'), 'click', stop)
  listen(button('switch'), 'click', () => { void loadScene(true) })
  listen(element('response'), 'change', () => { void loadScene(false) })
  listen(button('pause'), 'click', () => { void action(async active => {
    const current = generation
    if (paused) await active.play()
    else active.pause()
    if (current !== generation) return
    paused = !paused
    button('pause').textContent = paused ? 'Play' : 'Pause'
  }) })
  listen(button('reset'), 'click', () => { void action(active => { active.reset(); paused = true; button('pause').textContent = 'Play' }) })
  listen(button('clear'), 'click', () => { void action(active => { active.clearAudio(); element<HTMLInputElement>('audio').value = '' }) })
  listen(element('simulate'), 'change', () => { void action(active => active.setSynthetic(element<HTMLInputElement>('simulate').checked, 17, 1)) })
  listen(element('volume'), 'input', () => { void action(active => active.setVolume(Number(element<HTMLInputElement>('volume').value))) })
  listen(element('audio'), 'change', () => { const file = element<HTMLInputElement>('audio').files?.[0]; if (file) void loadAudio(file, false) })
  listen(button('test-audio'), 'click', () => { void loadAudio(createTestRhythm(), true) })
  listen(button('seek'), 'click', () => { void action(active => active.seek(Math.max(0, active.getAudioState().time - 5))) })
  listen(button('capture-button'), 'click', () => { void action(async active => {
    if (capturePending) return
    const current = generation
    capturePending = true
    button('capture-button').disabled = true
    try {
      const blob = await active.capture({ width: 320, height: 180, type: 'image/png' })
      if (current !== generation) return
      clearCapture()
      captureUrl = URL.createObjectURL(blob)
      captureImage.src = captureUrl
      captureImage.hidden = false
      status.textContent = 'Frame captured from the separate player.'
    } finally {
      if (current === generation && player) { capturePending = false; button('capture-button').disabled = false }
    }
  }) })
  const timer = setInterval(() => {
    if (!player) return
    const state = player.getAudioState()
    element('audio-status').textContent = state.loaded
      ? `${state.playing ? 'Music playing' : 'Music paused'} · ${state.time.toFixed(1)} / ${state.duration.toFixed(1)} seconds` : 'No music loaded.'
  }, 250)
  function dispose() {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    stop()
    listeners.splice(0).forEach(remove => remove())
  }
  listen(window, 'pagehide', dispose)
  return dispose
}
