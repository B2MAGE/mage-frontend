import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from './AppIcon'
import './toast.css'

type ToastProps = {
  message: string
  onDismiss: () => void
  durationMs?: number
}

/** Brief feedback that does not move focus or block the current task. */
export function Toast({ message, onDismiss, durationMs = 6000 }: ToastProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(durationMs)
  const dismissed = useRef(false)
  const onDismissRef = useRef(onDismiss)
  const paused = hovered || focused

  useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])
  useEffect(() => {
    remaining.current = durationMs
    dismissed.current = false
  }, [message, durationMs])
  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const timeout = window.setTimeout(() => {
      if (dismissed.current) return
      dismissed.current = true
      onDismissRef.current()
    }, remaining.current)
    return () => {
      window.clearTimeout(timeout)
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [message, durationMs, paused])

  function dismiss() {
    if (dismissed.current) return
    dismissed.current = true
    onDismissRef.current()
  }

  return createPortal(<div className="ui-toast"
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    }}>
    <span className="ui-toast__icon" aria-hidden="true"><AppIcon name="check" size={18} /></span>
    <p className="ui-toast__message" role="status" aria-live="polite" aria-atomic="true">{message}</p>
    <button className="ui-toast__close" type="button" aria-label="Dismiss notification" onClick={dismiss}>
      <AppIcon name="x" size={16} />
    </button>
  </div>, document.body)
}
