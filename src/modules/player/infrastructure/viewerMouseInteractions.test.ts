import type { InputState } from '@notrac/mage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachViewerMouseInteractions } from './viewerMouseInteractions'

const cleanCommands = {
  requestWheelDirection: 0,
  requestToggleUI: false,
  requestResetVisualizer: false,
  requestNextShader: false,
  requestPreviousShader: false,
}

const disposers: Array<() => void> = []

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  document.body.replaceChildren()
})

function fixture(options: { wheelZoom?: boolean } = {}, cameraOptions: { distance?: number; near?: number } = {}) {
  const canvas = document.createElement('canvas')
  canvas.style.touchAction = 'none'
  document.body.append(canvas)
  const nativePointerDown = vi.fn()
  const nativeContextMenu = vi.fn()
  // OrbitControls has already attached its own bubble listeners before the
  // viewer helper is created. Its capture filter must run ahead of these.
  canvas.addEventListener('pointerdown', nativePointerDown)
  canvas.addEventListener('contextmenu', nativeContextMenu)
  const fields = {
    controlSettings: { active: false, integrated: true },
    controls: {
      enabled: false, disconnect: vi.fn(), enableRotate: false, enableZoom: true, enablePan: true,
      mouseButtons: { LEFT: 0, MIDDLE: 1 as number | null, RIGHT: 2 as number | null },
      touches: { ONE: 0 as number | null, TWO: 2 as number | null },
      cursorStyle: 'auto',
      target: { x: 0, y: 0, z: 0 }, minDistance: 0, maxDistance: Infinity, zoomSpeed: 1,
    },
    camera: { near: cameraOptions.near ?? 0.1, position: { distanceTo: vi.fn(() => cameraOptions.distance ?? 10) } },
    state: { currMouse: { set: vi.fn() } },
    visualizer: { render_tooltips: true, mesh: null, getActiveShader: () => null },
  }
  const engine = {
    getEngineFields: () => fields,
    setInputState: vi.fn<(input: InputState) => void>(),
  }
  const nativeWheel = vi.fn((event: WheelEvent) => {
    if (fields.controls.enabled && fields.controls.enableZoom) event.preventDefault()
  })
  canvas.addEventListener('wheel', nativeWheel)
  const interactions = attachViewerMouseInteractions(canvas, engine, options)
  disposers.push(interactions.dispose)
  return { canvas, fields, engine, interactions, nativePointerDown, nativeContextMenu, nativeWheel }
}

function pointer(target: EventTarget, type: string, options: MouseEventInit & { pointerType?: string; pointerId?: number; isPrimary?: boolean } = {}) {
  const { pointerType = 'mouse', pointerId = 1, isPrimary = true, ...mouseOptions } = options
  const event = new MouseEvent(type, { bubbles: !['pointerenter', 'pointerleave'].includes(type), cancelable: true, clientX: 120, clientY: 80, ...mouseOptions })
  // jsdom versions without PointerEvent still need realistic pointer metadata.
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    isPrimary: { value: isPrimary },
  })
  target.dispatchEvent(event)
  return event
}

function expectNeutral({ fields, engine }: ReturnType<typeof fixture>) {
  expect(engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
    ...cleanCommands, pointerOverUi: true, currPointerDown: 0,
  }))
  expect(fields.state.currMouse.set).toHaveBeenLastCalledWith(0, 0, 0)
}

describe('viewer mouse interactions', () => {
  it('retains native drag rotation while disabling zoom, pan, touch gestures, and engine UI', () => {
    const { canvas, fields } = fixture()

    expect(fields.controls.disconnect).not.toHaveBeenCalled()
    expect(fields.controlSettings).toEqual({ active: true, integrated: false })
    expect(fields.controls).toMatchObject({
      enabled: true, enableRotate: true, enableZoom: false, enablePan: false,
      mouseButtons: { LEFT: 0, MIDDLE: null, RIGHT: null },
      touches: { ONE: null, TWO: null },
      cursorStyle: 'grab',
    })
    expect(canvas.style.touchAction).toBe('auto')
    expect(fields.visualizer.render_tooltips).toBe(false)
  })

  it.each(['mouse', 'pen'])('lets left-button %s presses reach native drag controls as well as shader input', pointerType => {
    const current = fixture()
    const event = pointer(current.canvas, 'pointerdown', { pointerType, button: 0, buttons: 1 })

    expect(current.nativePointerDown).toHaveBeenCalledExactlyOnceWith(event)
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({ currPointerDown: 1 }))
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    { pointerType: 'touch', button: 0, buttons: 1 },
    { pointerType: 'mouse', button: 1, buttons: 4 },
    { pointerType: 'mouse', button: 2, buttons: 2 },
  ])('filters $pointerType button $button before native pointer capture without blocking browser defaults', options => {
    const current = fixture()
    current.engine.setInputState.mockClear()
    const event = pointer(current.canvas, 'pointerdown', options)

    expect(current.nativePointerDown).not.toHaveBeenCalled()
    expect(current.engine.setInputState).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each(['mouse', 'pen'])('routes %s enter and movement only from its own canvas with command flags cleared', pointerType => {
    const first = fixture()
    const second = fixture()
    first.engine.setInputState.mockClear()
    second.engine.setInputState.mockClear()

    pointer(first.canvas, 'pointerenter', { pointerType, clientX: 145, clientY: 93 })
    expect(first.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      ...cleanCommands, clientX: 145, clientY: 93, pointerOverUi: false, currPointerDown: 0,
    }))
    pointer(first.canvas, 'pointermove', { pointerType, clientX: 180, clientY: 115 })
    expect(first.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      ...cleanCommands, clientX: 180, clientY: 115, pointerOverUi: false, currPointerDown: 0,
    }))
    expect(second.engine.setInputState).not.toHaveBeenCalled()

    const calls = first.engine.setInputState.mock.calls.length
    pointer(window, 'pointermove', { pointerType, clientX: 900, clientY: 700 })
    pointer(document.body, 'pointermove', { pointerType, clientX: 800, clientY: 600 })
    expect(first.engine.setInputState).toHaveBeenCalledTimes(calls)
    expect(second.engine.setInputState).not.toHaveBeenCalled()
  })

  it('presses and releases the primary button without leaving a stuck click or losing canvas hover', () => {
    const current = fixture()
    pointer(current.canvas, 'pointerenter')
    pointer(current.canvas, 'pointerdown', { button: 0, buttons: 1 })
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      ...cleanCommands, pointerOverUi: false, currPointerDown: 1,
    }))
    pointer(current.canvas, 'pointermove', { buttons: 1, clientX: 140, clientY: 90 })
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({ currPointerDown: 1 }))
    pointer(current.canvas, 'pointerup', { button: 0, buttons: 0 })
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      ...cleanCommands, pointerOverUi: false, currPointerDown: 0,
    }))
  })

  it('releases a press outside the canvas and returns the shader mouse to neutral', () => {
    const current = fixture()
    pointer(current.canvas, 'pointerdown', { button: 0, buttons: 1 })
    pointer(window, 'pointerup', { button: 0, buttons: 0, clientX: 800, clientY: 600 })
    expectNeutral(current)

    pointer(current.canvas, 'pointerenter')
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      pointerOverUi: false, currPointerDown: 0,
    }))
  })

  it.each(['pointerleave', 'pointercancel', 'lostpointercapture', 'blur', 'scroll', 'resize', 'hidden'])('neutralizes hover and press on %s', reason => {
    const current = fixture()
    pointer(current.canvas, 'pointerdown', { button: 0, buttons: 1 })

    if (['blur', 'scroll', 'resize'].includes(reason)) window.dispatchEvent(new Event(reason))
    else if (reason === 'hidden') {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
    } else pointer(current.canvas, reason)

    expectNeutral(current)
    pointer(current.canvas, 'pointerenter')
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({ currPointerDown: 0 }))
  })

  it('provides an explicit input reset without disconnecting future canvas interaction', () => {
    const current = fixture()
    pointer(current.canvas, 'pointerdown', { button: 0, buttons: 1 })
    current.interactions.reset()
    expectNeutral(current)
    expect(current.fields.controlSettings.active).toBe(true)
    expect(current.fields.controls.enabled).toBe(true)

    pointer(current.canvas, 'pointermove', { clientX: 200, clientY: 110 })
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 200, clientY: 110, pointerOverUi: false, currPointerDown: 0,
    }))
  })

  it('enables optional gentle wheel zoom with bounds relative to the authored camera distance', () => {
    const { fields } = fixture({ wheelZoom: true })

    expect(fields.controls).toMatchObject({ enableZoom: true, enablePan: false, minDistance: 4, maxDistance: 25, zoomSpeed: 0.65 })
    expect(fields.camera.position.distanceTo).toHaveBeenCalledWith(fields.controls.target)
  })

  it('respects the near-plane margin without excluding the authored camera position', () => {
    const nearLimited = fixture({ wheelZoom: true }, { distance: 10, near: 2 })
    expect(nearLimited.fields.controls).toMatchObject({ minDistance: 8, maxDistance: 25 })
    const authoredInsideMargin = fixture({ wheelZoom: true }, { distance: 1, near: 2 })
    expect(authoredInsideMargin.fields.controls).toMatchObject({ minDistance: 1, maxDistance: 2.5 })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('uses finite zoom limits when the authored distance is invalid (%s)', distance => {
    const { fields } = fixture({ wheelZoom: true }, { distance, near: Number.NaN })
    expect(fields.controls.minDistance).toBeCloseTo(2.2)
    expect(fields.controls.maxDistance).toBe(13.75)
  })

  it('clears previous bounds before a new preset and recalibrates only after it has loaded', () => {
    const current = fixture({ wheelZoom: true })
    current.fields.camera.position.distanceTo.mockReturnValue(2)
    current.interactions.reset()
    window.dispatchEvent(new Event('scroll'))
    expect(current.fields.controls).toMatchObject({ minDistance: 4, maxDistance: 25 })

    current.interactions.prepareSceneLoad()
    expect(current.fields.controls).toMatchObject({ minDistance: 0, maxDistance: Infinity })
    current.fields.camera.position.distanceTo.mockReturnValue(60)
    current.interactions.sceneLoaded()
    expect(current.fields.controls).toMatchObject({ minDistance: 24, maxDistance: 150 })
    expectNeutral(current)

    current.interactions.prepareSceneLoad()
    current.fields.camera.position.distanceTo.mockReturnValue(1)
    current.interactions.sceneLoaded()
    expect(current.fields.controls).toMatchObject({ minDistance: 0.4, maxDistance: 2.5 })
  })

  it('leaves artwork wheel scrolling and authored zoom bounds untouched by default', () => {
    const current = fixture()
    current.fields.controls.minDistance = 3
    current.fields.controls.maxDistance = 40
    current.interactions.prepareSceneLoad()
    current.interactions.sceneLoaded()
    expect(current.fields.controls).toMatchObject({ enableZoom: false, minDistance: 3, maxDistance: 40 })
    current.engine.setInputState.mockClear()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })
    current.canvas.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(current.engine.setInputState).not.toHaveBeenCalled()
  })

  it('reactivates native wheel zoom after idle or scrolling without emitting shader commands', () => {
    const current = fixture({ wheelZoom: true })
    window.dispatchEvent(new Event('scroll'))
    current.fields.controls.enabled = false
    current.engine.setInputState.mockClear()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 240, clientY: 125, deltaY: -120 })
    current.canvas.dispatchEvent(event)

    expect(current.nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(current.fields.controls.enabled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(current.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({
      ...cleanCommands, clientX: 240, clientY: 125, pointerOverUi: false, currPointerDown: 0,
    }))
  })

  it.each(['ctrlKey', 'metaKey'])('preserves browser %s-wheel zoom without passing it to OrbitControls', modifier => {
    const current = fixture({ wheelZoom: true })
    current.engine.setInputState.mockClear()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120, [modifier]: true })
    current.canvas.dispatchEvent(event)

    expect(current.nativeWheel).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(current.engine.setInputState).not.toHaveBeenCalled()
  })

  it('never routes wheel input from outside its canvas and removes its wheel capture filter on dispose', () => {
    const current = fixture({ wheelZoom: true })
    current.engine.setInputState.mockClear()
    window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }))
    expect(current.engine.setInputState).not.toHaveBeenCalled()
    expect(current.nativeWheel).not.toHaveBeenCalled()

    current.interactions.dispose()
    current.engine.setInputState.mockClear()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 120 })
    current.canvas.dispatchEvent(event)
    expect(current.nativeWheel).toHaveBeenCalledExactlyOnceWith(event)
    expect(current.engine.setInputState).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not turn right-clicks, scrolling, or keyboard shortcuts into engine commands', () => {
    const current = fixture()
    pointer(current.canvas, 'pointerenter')
    pointer(current.canvas, 'pointerdown', { button: 2, buttons: 2 })
    pointer(current.canvas, 'pointerup', { button: 2, buttons: 0 })
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 })
    current.canvas.dispatchEvent(menu)
    current.canvas.dispatchEvent(wheel)
    for (const key of ['r', 'h', 'ArrowRight', 'ArrowLeft', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      current.canvas.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(menu.defaultPrevented).toBe(false)
    expect(current.nativeContextMenu).not.toHaveBeenCalled()
    expect(wheel.defaultPrevented).toBe(false)
    for (const [input] of current.engine.setInputState.mock.calls) {
      expect(input).toMatchObject({ ...cleanCommands, currPointerDown: 0 })
    }
  })

  it('never activates hover or press from touch input or interferes with touch scrolling', () => {
    const current = fixture()
    current.engine.setInputState.mockClear()
    for (const type of ['pointerenter', 'pointermove', 'pointerdown', 'pointerup']) {
      const event = pointer(current.canvas, type, { pointerType: 'touch', button: 0, buttons: 1 })
      expect(event.defaultPrevented).toBe(false)
    }
    expect(current.engine.setInputState).not.toHaveBeenCalled()
    // Leaving/cancelling a touch may defensively clear a previous mouse signal,
    // but must never introduce a touch-driven hover, press, or editor command.
    for (const type of ['pointerleave', 'pointercancel']) {
      const event = pointer(current.canvas, type, { pointerType: 'touch' })
      expect(event.defaultPrevented).toBe(false)
    }
    for (const [input] of current.engine.setInputState.mock.calls) {
      expect(input).toMatchObject({ ...cleanCommands, pointerOverUi: true, currPointerDown: 0 })
    }
  })

  it('removes all listeners, neutralizes and disables interactions, and disposes idempotently', () => {
    const current = fixture()
    pointer(current.canvas, 'pointerdown', { button: 0, buttons: 1 })
    current.interactions.dispose()
    expectNeutral(current)
    expect(current.fields.controlSettings.active).toBe(false)
    expect(current.fields.controls.enabled).toBe(false)
    const calls = current.engine.setInputState.mock.calls.length
    const resets = current.fields.state.currMouse.set.mock.calls.length

    current.interactions.dispose()
    current.interactions.reset()
    for (const type of ['pointerenter', 'pointermove', 'pointerdown', 'pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture']) {
      pointer(current.canvas, type)
    }
    pointer(window, 'pointerup')
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(current.engine.setInputState).toHaveBeenCalledTimes(calls)
    expect(current.fields.state.currMouse.set).toHaveBeenCalledTimes(resets)
    expect(current.fields.controlSettings.active).toBe(false)
    expect(current.fields.controls.enabled).toBe(false)
    current.nativePointerDown.mockClear()
    current.nativeContextMenu.mockClear()
    pointer(current.canvas, 'pointerdown', { pointerType: 'touch' })
    current.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(current.nativePointerDown).toHaveBeenCalledOnce()
    expect(current.nativeContextMenu).toHaveBeenCalledOnce()
  })
})
