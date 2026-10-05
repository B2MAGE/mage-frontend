import { useEffect, useId, useRef, useState } from 'react'
import { AppIcon } from '@shared/ui'
import { PauseAllScenesToggle } from './PauseAllScenesToggle'

export function PlaybackOptions({ onStopScene, onClearMusic, onPauseAllScenes }: {
  onStopScene?: () => void
  onClearMusic?: () => void
  onPauseAllScenes?: () => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="mage-player__playback-options" ref={root}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
    <button type="button" className="mage-player__control-button" ref={trigger}
      aria-label="Playback options" title="Playback options" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen((value) => !value)}>
      <AppIcon name="settings" />
    </button>
    {open ? <div className="mage-player__options-panel" id={id} role="group" aria-label="Playback options">
      {onStopScene ? <button type="button" onClick={() => { setOpen(false); onStopScene() }}>Stop this scene</button> : null}
      {onClearMusic ? <button type="button"
        title="Remove all songs loaded in this player without changing your saved scenes."
        onClick={() => { setOpen(false); trigger.current?.focus(); onClearMusic() }}>Clear music</button> : null}
      {onPauseAllScenes ? <PauseAllScenesToggle checked={false} onChange={() => { setOpen(false); onPauseAllScenes() }} /> : null}
    </div> : null}
  </div>
}
