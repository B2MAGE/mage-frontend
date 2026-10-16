import { useRef, useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyInspectorBands, type AudioInspectorSnapshot, type BuilderSceneDocument } from '@modules/player'
import { mockNativeDialogs } from '@shared/test/nativeDialog'
import { createAudioInspectorStore, type AudioInspectorStore } from '../audioInspectorStore'
import { createBuilderScene, createBuilderObject } from '../builderEditor'
import { AudioInspectorDrawer } from './AudioInspectorDrawer'

mockNativeDialogs()

function Harness({ mobile = false, store: suppliedStore, document = null }: {
  mobile?: boolean; store?: AudioInspectorStore; document?: BuilderSceneDocument | null
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [store] = useState(() => suppliedStore ?? createAudioInspectorStore())
  const [desktopHost, setDesktopHost] = useState<HTMLDivElement | null>(null)
  const [mobileHost, setMobileHost] = useState<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  return <>
    <button ref={trigger} onClick={() => setOpen(value => !value)}>Audio</button>
    <button onClick={() => setPlaying(value => !value)}>{playing ? 'Pause track' : 'Play track'}</button>
    <div data-testid="desktop-host" ref={setDesktopHost} />
    <div data-testid="mobile-host" ref={setMobileHost} />
    <AudioInspectorDrawer id="inspector" open={open} host={mobile ? mobileHost : desktopHost} onClose={() => setOpen(false)}
      triggerRef={trigger} document={document} selectedObjectId={selected} onSelectObject={setSelected} store={store} />
  </>
}

const sample = (): AudioInspectorSnapshot => ({ mode: 'legacy', source: 'audio', playing: true, audioLoaded: true,
  levels: { ...emptyInspectorBands(), bass: .42 }, hits: emptyInspectorBands(),
  sceneOutputs: { size: .5 }, bindings: [], driverSignals: [] })

describe('below-player audio inspector', () => {
  it('unmounts closed content, unsubscribes, and restores trigger focus on close or Escape', () => {
    const store = createAudioInspectorStore()
    const originalSubscribe = store.subscribe
    const unsubscribe = vi.fn()
    const subscribe = vi.spyOn(store, 'subscribe').mockImplementation(listener => {
      const release = originalSubscribe(listener)
      return () => { unsubscribe(); release() }
    })
    render(<Harness store={store} />)
    const trigger = screen.getByRole('button', { name: 'Audio' })
    expect(document.querySelector('dialog')).toBeNull()
    expect(subscribe).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Audio inspector' })).not.toHaveAttribute('aria-modal')
    expect(screen.getByRole('button', { name: 'Close audio inspector' })).toHaveFocus()
    expect(subscribe).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close audio inspector' }))
    expect(document.querySelector('dialog')).toBeNull()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
    act(() => store.publish(sample()))
    expect(screen.queryByLabelText('Bass level value')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('dialog')).toBeNull()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
    expect(trigger).toHaveFocus()
  })

  it.each([false, true])('keeps playback usable without a modal or expansion controls (mobile=%s)', mobile => {
    const modal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    render(<Harness mobile={mobile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }))
    const dialog = screen.getByRole('dialog', { name: 'Audio inspector' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(modal).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Expand|Reduce/ })).not.toBeInTheDocument()
    expect(within(screen.getByTestId(mobile ? 'mobile-host' : 'desktop-host')).getByRole('dialog')).toBe(dialog)
    const pause = screen.getByRole('button', { name: 'Pause track' })
    expect(pause).not.toBeDisabled()
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Play track' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBe(dialog)
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Audio' })).toHaveFocus()
  })

  it('moves between layout hosts without losing object selection or current readings', () => {
    const document = createBuilderScene()
    document.objects.push(createBuilderObject('box', document.objects))
    const store = createAudioInspectorStore()
    store.publish(sample())
    const view = render(<Harness document={document} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }))
    fireEvent.change(screen.getByLabelText('Inspect object'), { target: { value: document.objects[1].id } })
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.420')
    view.rerender(<Harness mobile document={document} store={store} />)
    expect(within(screen.getByTestId('desktop-host')).queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('mobile-host')).getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Inspect object')).toHaveValue(document.objects[1].id)
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.420')
    view.rerender(<Harness document={document} store={store} />)
    expect(within(screen.getByTestId('mobile-host')).queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('desktop-host')).getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Inspect object')).toHaveValue(document.objects[1].id)
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.420')
  })
})
