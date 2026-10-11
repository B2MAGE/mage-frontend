import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AppIcon } from '@shared/ui'
import type { SceneDraftStatus } from '../sceneDraftRecovery'

type SceneDraftHeaderProps = {
  canUndo: boolean
  canRedo: boolean
  canReset: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  status: SceneDraftStatus
  hasCandidate: boolean
  baseChanged: boolean
  requiresResolution: boolean
  isSubmitting: boolean
  saveNeedsReview: boolean
  onRestore: () => void
  onDiscard: () => void
}

const statusLabels: Record<SceneDraftStatus['kind'], string> = {
  idle: 'Browser draft',
  saved: 'Draft saved',
  available: 'Draft available',
  conflict: 'Draft conflict',
  error: 'Draft warning',
}

export function SceneDraftHeader({ canUndo, canRedo, canReset, onUndo, onRedo, onReset,
  status, hasCandidate, baseChanged, requiresResolution, isSubmitting, saveNeedsReview,
  onRestore, onDiscard }: SceneDraftHeaderProps) {
  const [open, setOpen] = useState<'recovery' | 'options' | null>(null)
  const id = useId()
  const root = useRef<HTMLElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const recoveryTrigger = useRef<HTMLButtonElement>(null)
  const optionsTrigger = useRef<HTMLButtonElement>(null)
  const label = saveNeedsReview && !requiresResolution && status.kind !== 'error' ? 'Review draft' : statusLabels[status.kind]
  const needsAttention = requiresResolution || status.kind === 'error' || saveNeedsReview

  useLayoutEffect(() => {
    const header = root.current
    const popover = panel.current
    const frame = header?.closest('.scene-editor-layout')
    if (!open || !header || !popover || !frame) return
    const position = () => {
      const anchor = header.getBoundingClientRect()
      const bounds = frame.getBoundingClientRect()
      const below = Math.max(0, bounds.bottom - anchor.bottom - 8)
      const above = Math.max(0, anchor.top - bounds.top - 8)
      const opensAbove = popover.scrollHeight > below && above > below
      popover.style.top = opensAbove ? 'auto' : 'var(--draft-header-height)'
      popover.style.bottom = opensAbove ? '100%' : 'auto'
      popover.style.maxHeight = `${opensAbove ? above : below}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(frame)
    observer.observe(header)
    return () => observer.disconnect()
  }, [open, status.message, baseChanged, saveNeedsReview, isSubmitting])

  useEffect(() => {
    if (!open) return
    // This is a disclosure with explanatory text and ordinary tab stops, not an application menu.
    panel.current?.focus()
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(null)
      const trigger = open === 'recovery' ? recoveryTrigger : optionsTrigger
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function run(action: () => void) {
    const trigger = open === 'recovery' ? recoveryTrigger : optionsTrigger
    setOpen(null)
    action()
    trigger.current?.focus()
  }

  return <header aria-label="Draft editing" className="scene-draft-header" ref={root}>
    <h2 className="scene-draft-header__title">Editor</h2>
    <div className="scene-draft-header__actions">
      <button aria-controls={open === 'recovery' ? `${id}-panel` : undefined} aria-expanded={open === 'recovery'}
        className="scene-draft-header__status" data-attention={needsAttention} data-status={status.kind}
        id={`${id}-recovery`} onClick={() => setOpen(open === 'recovery' ? null : 'recovery')}
        ref={recoveryTrigger} type="button">
        <span aria-hidden="true" className="scene-draft-header__dot" />
        <span>{label}</span><AppIcon name="chevron-down" size={12} />
      </button>
      <div aria-label="History" className="scene-draft-header__history" role="group">
        <button aria-label="Undo" className="scene-draft-header__icon" disabled={!canUndo}
          onClick={() => { setOpen(null); onUndo() }} title="Undo (Ctrl/Cmd+Z)" type="button">
          <AppIcon name="undo-2" size={16} />
        </button>
        <button aria-label="Redo" className="scene-draft-header__icon" disabled={!canRedo}
          onClick={() => { setOpen(null); onRedo() }} title="Redo (Ctrl/Cmd+Shift+Z)" type="button">
          <AppIcon name="redo-2" size={16} />
        </button>
      </div>
      <button aria-controls={open === 'options' ? `${id}-panel` : undefined} aria-expanded={open === 'options'}
        aria-label="Draft options" className="scene-draft-header__icon scene-draft-header__more"
        id={`${id}-options`} onClick={() => setOpen(open === 'options' ? null : 'options')}
        ref={optionsTrigger} title="Draft options" type="button">
        <AppIcon name="ellipsis" size={16} />
      </button>
    </div>
    <span className="scene-draft-header__announcement" role="status">{status.message}</span>
    {open ? <div aria-labelledby={`${id}-${open}`} className="scene-draft-header__popover"
      id={`${id}-panel`} ref={panel} role="region" tabIndex={-1}>
      {open === 'recovery' ? <>
        <p>{status.message || 'Your changes are backed up in this browser as you edit. Publish the scene to save it to your account.'}</p>
        {baseChanged ? <p>The saved scene has changed since this draft began. Restoring keeps your draft; saving will check for a conflict.</p> : null}
        {saveNeedsReview ? <p><a href="/my-scenes" target="_blank" rel="noopener noreferrer">Open My Scenes</a> to check the saved version. Your current draft stays in this editor.</p> : null}
        {requiresResolution ? <div className="scene-draft-header__choices">
          {hasCandidate ? <button className="scene-secondary-button" disabled={isSubmitting} onClick={() => run(onRestore)} type="button">Restore draft</button> : null}
          <button className="scene-secondary-button" disabled={isSubmitting} onClick={() => run(onDiscard)} type="button">
            {status.kind === 'conflict' ? 'Keep this editor’s draft' : 'Discard browser draft'}
          </button>
        </div> : null}
        {requiresResolution && isSubmitting ? <p>Wait for the current save to finish before choosing a browser draft.</p> : null}
      </> : <>
        <button className="scene-secondary-button" disabled={!canReset} onClick={() => run(onReset)} type="button">
          <AppIcon name="rotate-ccw" size={14} /> Reset draft
        </button>
        <p>Reset returns to the draft you opened. You can undo it.</p>
      </>}
    </div> : null}
  </header>
}
