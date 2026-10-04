import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Shield, X } from 'lucide-react'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { sceneAvailabilityStore } from '../sceneAvailability'
import { fetchAdminCapabilities, isModerationAccessDenied } from '@modules/moderation'
import {
  fetchSceneControl, isOperatorAccessDenied, OperatorRequestError, updateSceneControl, type SceneControl,
} from './adminApi'
import './sceneAvailabilityAdmin.css'

export function SceneAvailabilityAdminControls({ sceneId }: { sceneId: number }) {
  const { accessToken, authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  if (!isAuthenticated || isRestoringSession || !accessToken || !user?.userId) return null
  return <OperatorControls key={`${accessToken}:${user.userId}:${sceneId}`} sceneId={sceneId} fetcher={authenticatedFetch} />
}

function AuditDetails({ control }: { control: SceneControl }) {
  if (!control.changedAt) return null
  return <div className="scene-availability-admin__audit">
    <p>Last changed {new Date(control.changedAt).toLocaleString()}{control.changedByUserId ? ` by account #${control.changedByUserId}` : ''}.</p>
    <p>Previous reason: {control.reason}</p>
  </div>
}

function AvailabilityDialog({ id, onClose, children }: { id: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backdropPointerDown = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  return createPortal(<dialog
    ref={dialogRef}
    id={id}
    className="scene-availability-admin__dialog"
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onPointerDown={(event) => { backdropPointerDown.current = event.target === event.currentTarget }}
    onClick={(event) => {
      if (event.target === event.currentTarget && backdropPointerDown.current) onClose()
      backdropPointerDown.current = false
    }}
  >
    <div className="scene-availability-admin__panel">
      <header className="scene-availability-admin__header">
        <h2 id={titleId}>Manage this scene</h2>
        <button type="button" className="scene-availability-admin__close" aria-label="Close scene controls" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {children}
    </div>
  </dialog>, document.body)
}

function OperatorControls({ sceneId, fetcher }: { sceneId: number; fetcher: AuthenticatedFetch }) {
  const [control, setControl] = useState<SceneControl | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const reasonId = useId()
  const dialogId = useId()
  const reasonHintId = useId()

  function closeDialog() {
    setIsOpen(false)
    setReason('')
    setNotice(null)
  }

  function revokeAccess() {
    setControl(null)
    closeDialog()
  }

  function active(signal: AbortSignal) {
    return !signal.aborted && lifecycle.current?.signal === signal
  }

  function accessDenied(error: unknown) {
    return isOperatorAccessDenied(error) || isModerationAccessDenied(error)
  }

  async function refresh(signal: AbortSignal) {
    try {
      const capabilities = await fetchAdminCapabilities(fetcher, signal)
      if (!active(signal)) return
      if (!capabilities.canModerateScenes) {
        revokeAccess()
        return
      }
      // This dialog only reads this scene's private status. The backend
      // independently authorizes every subsequent read and write.
      const scene = await fetchSceneControl(fetcher, sceneId, signal)
      if (active(signal)) setControl(scene)
    } catch (error) {
      // Includes the refresh after a committed mutation: old permissions and
      // private audit must not appear current when the fresh read is unknown.
      if (active(signal)) revokeAccess()
      throw error
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    revokeAccess()
    const verify = async () => {
      if (!active(controller.signal) || busy.current || document.visibilityState === 'hidden') return
      busy.current = true
      setPending(true)
      try { await refresh(controller.signal) }
      catch { if (active(controller.signal)) revokeAccess() }
      finally {
        if (active(controller.signal)) { busy.current = false; setPending(false) }
      }
    }
    busy.current = false
    void verify()
    const onFocus = () => { void verify() }
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.removeEventListener('focus', onFocus) }
    // The account/scene key remounts this component; a changed fetcher also
    // retires all requests rather than retaining the previous session's audit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, sceneId])

  async function handleRefresh() {
    const signal = lifecycle.current?.signal
    if (!signal || signal.aborted || busy.current) return
    busy.current = true
    setPending(true)
    try {
      await refresh(signal)
      if (active(signal)) setNotice(null)
    } catch {
      if (!active(signal)) return
      revokeAccess()
    } finally {
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const signal = lifecycle.current?.signal
    if (!control || !signal || !active(signal) || busy.current) return
    const trimmedReason = reason.trim()
    if (!trimmedReason || trimmedReason.length > 1000) {
      setNotice({ error: true, text: 'Add a reason (up to 1,000 characters).' })
      return
    }
    busy.current = true
    setPending(true)
    setNotice(null)
    let invalidated = false
    let mutationAttempted = false
    try {
      // Permission may have been revoked since the dialog was opened.
      const capabilities = await fetchAdminCapabilities(fetcher, signal)
      if (!active(signal)) return
      if (!capabilities.canModerateScenes) {
        revokeAccess()
        return
      }
      mutationAttempted = true
      await updateSceneControl(fetcher, sceneId, !control.disabled, trimmedReason, signal)
      sceneAvailabilityStore.invalidate(sceneId)
      invalidated = true
      if (!active(signal)) return
      setReason('')
      await refresh(signal)
      if (active(signal)) setNotice({ error: false, text: control.disabled ? 'Scene unblocked.' : 'Scene blocked.' })
    } catch (error) {
      if (!active(signal)) return
      if (accessDenied(error) || !mutationAttempted) revokeAccess()
      else {
        setNotice({ error: true, text: error instanceof OperatorRequestError
          ? "We couldn't save the change. Check the current status and try again."
          : "We couldn't confirm whether your change was saved. Check the current status before trying again." })
        if (error instanceof OperatorRequestError && error.status === 409) {
          try { await refresh(signal) } catch (refreshError) {
            if (active(signal) && accessDenied(refreshError)) revokeAccess()
          }
        }
      }
    } finally {
      // A failed or aborted response may still represent a committed server change.
      if (mutationAttempted && !invalidated) sceneAvailabilityStore.invalidate(sceneId)
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }

  if (!control) return null
  return <>
    <button
      type="button"
      className="scene-availability-admin__trigger"
      aria-label="Manage this scene"
      title="Manage this scene"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={isOpen ? dialogId : undefined}
      onClick={() => setIsOpen(true)}
    >
      <Shield size={18} aria-hidden="true" />
    </button>
    {isOpen ? <AvailabilityDialog id={dialogId} onClose={closeDialog}>
      <div className="scene-availability-admin__content" aria-busy={pending}>
        <p className="scene-availability-admin__intro">Blocking this scene stops it from playing for everyone. It stays saved and can be unblocked later.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <p><strong>{control.disabled ? 'This scene is blocked.' : 'This scene is not blocked.'}</strong></p>
          <AuditDetails control={control} />
          <label htmlFor={reasonId}>Why are you making this change?</label>
          <textarea id={reasonId} aria-describedby={reasonHintId} value={reason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setReason(event.target.value)} />
          <p id={reasonHintId} className="scene-availability-admin__intro">Required. Only moderators and administrators can see your reason.</p>
          <button type="submit" disabled={pending || !reason.trim()}>{control.disabled ? 'Unblock scene' : 'Block scene'}</button>
        </form>
        {pending ? <p role="status">Updating…</p> : null}
        {notice ? <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null}
        <button type="button" disabled={pending} onClick={() => void handleRefresh()}>Check current status</button>
      </div>
    </AvailabilityDialog> : null}
  </>
}
