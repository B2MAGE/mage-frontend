import { useEffect, useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@shared/ui'
import { AudioInspectorContents } from './AudioInspectorPanel'
import './audio-inspector-drawer.css'

type Props = ComponentProps<typeof AudioInspectorContents> & {
  id: string
  open: boolean
  host: HTMLElement | null
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

function OpenInspector({ id, onClose, triggerRef, ...contents }: Omit<Props, 'open' | 'host'>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose }, [onClose])

  useLayoutEffect(() => {
    const element = dialog.current!
    // Inspection never blocks or dims the player, including on narrow screens.
    element.show()
    closeButton.current?.focus({ preventScroll: true })
    return () => element.close()
  }, [])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog:modal')) return
      event.preventDefault()
      close.current()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [])

  useEffect(() => {
    const trigger = triggerRef.current
    return () => trigger?.focus({ preventScroll: true })
  }, [triggerRef])

  return <dialog ref={dialog} id={id} className="audio-inspector-drawer"
    aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="audio-inspector-drawer__header">
      <div className="audio-inspector-drawer__heading"><h3 id={`${id}-title`}>Audio inspector</h3><p>See what the music changes</p></div>
      <button ref={closeButton} type="button" className="audio-inspector-drawer__button" aria-label="Close audio inspector" onClick={onClose}><AppIcon name="x" size={17} /></button>
    </header>
    <div className="audio-inspector-drawer__scroll"><AudioInspectorContents {...contents} /></div>
  </dialog>
}

/** Closed means unmounted: no layout space, subscriptions, focusable controls or spectrum drawing. */
export function AudioInspectorDrawer({ open, host, ...props }: Props) {
  return open && host ? createPortal(<OpenInspector {...props} />, host) : null
}
