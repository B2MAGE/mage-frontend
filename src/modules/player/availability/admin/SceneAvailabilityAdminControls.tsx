import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Shield, X } from 'lucide-react'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { sceneAvailabilityStore } from '../sceneAvailability'
import { fetchAdminCapabilities, isModerationAccessDenied, type AdminCapabilities } from '@modules/moderation'
import {
  fetchCustomControl, fetchSceneControl, isOperatorAccessDenied, OperatorRequestError,
  updateCustomControl, updateSceneControl, type CustomRenderingControl, type SceneControl,
} from './adminApi'
import './sceneAvailabilityAdmin.css'

type Controls = { capabilities: AdminCapabilities; custom: CustomRenderingControl | null; scene: SceneControl | null }
type AvailabilityTool = 'scene' | 'global'

export function SceneAvailabilityAdminControls({ sceneId }: { sceneId: number }) {
  const { accessToken, authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  if (!isAuthenticated || isRestoringSession || !accessToken || !user?.userId) return null
  return <OperatorControls key={`${accessToken}:${user.userId}:${sceneId}`} sceneId={sceneId} fetcher={authenticatedFetch} />
}

function AuditDetails({ control }: { control: SceneControl | CustomRenderingControl }) {
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
        <h2 id={titleId}>Moderation tools</h2>
        <button type="button" className="scene-availability-admin__close" aria-label="Close moderation tools" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {children}
    </div>
  </dialog>, document.body)
}

function OperatorControls({ sceneId, fetcher }: { sceneId: number; fetcher: AuthenticatedFetch }) {
  const [controls, setControls] = useState<Controls | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [selectedTool, setSelectedTool] = useState<AvailabilityTool>('scene')
  const [sceneReason, setSceneReason] = useState('')
  const [globalReason, setGlobalReason] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const sceneReasonId = useId()
  const globalReasonId = useId()
  const dialogId = useId()
  const toolId = useId()
  const reasonHintId = useId()

  function closeDialog() {
    setIsOpen(false)
    setSelectedTool('scene')
    setSceneReason('')
    setGlobalReason('')
    setNotice(null)
  }

  function revokeAccess() {
    setControls(null)
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
      if (!capabilities.canModerateScenes && !capabilities.canManageCustomRendering) {
        revokeAccess()
        return
      }
      // Capability discovery never exposes another scope's private status/audit.
      // The backend independently authorizes every subsequent read and write.
      const scene = capabilities.canModerateScenes ? await fetchSceneControl(fetcher, sceneId, signal) : null
      if (!active(signal)) return
      const custom = capabilities.canManageCustomRendering ? await fetchCustomControl(fetcher, signal) : null
      if (!active(signal)) return
      if (!scene) setSceneReason('')
      if (!custom) setGlobalReason('')
      setSelectedTool((current) => current === 'global' && custom ? 'global' : scene ? 'scene' : 'global')
      setControls({ capabilities, custom, scene })
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
      // Unknown permission cannot keep previously privileged controls active.
      revokeAccess()
    } finally {
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }

  async function handleSubmit(event: FormEvent, target: AvailabilityTool) {
    event.preventDefault()
    const signal = lifecycle.current?.signal
    if (!controls || !signal || !active(signal) || busy.current) return
    if (target === 'scene' ? !controls.scene || !controls.capabilities.canModerateScenes
      : !controls.custom || !controls.capabilities.canManageCustomRendering) return
    const reason = (target === 'scene' ? sceneReason : globalReason).trim()
    if (!reason || reason.length > 1000) {
      setNotice({ error: true, text: 'Add a reason (up to 1,000 characters).' })
      return
    }
    if (target === 'global' && !controls.custom!.enabled && !controls.custom!.releaseApproved) return
    busy.current = true
    setPending(true)
    setNotice(null)
    let invalidated = false
    let mutationAttempted = false
    try {
      // A role may have been revoked since the panel was opened. Discover its
      // current scopes before issuing a mutation; never infer them from a token.
      const capabilities = await fetchAdminCapabilities(fetcher, signal)
      if (!active(signal)) return
      if (target === 'scene' ? !capabilities.canModerateScenes : !capabilities.canManageCustomRendering) {
        revokeAccess()
        await refresh(signal)
        return
      }
      mutationAttempted = true
      if (target === 'scene') await updateSceneControl(fetcher, sceneId, !controls.scene!.disabled, reason, signal)
      else await updateCustomControl(fetcher, !controls.custom!.enabled, reason, signal)
      sceneAvailabilityStore.invalidate(target === 'scene' ? sceneId : undefined)
      invalidated = true
      if (!active(signal)) return
      if (target === 'scene') setSceneReason('')
      else setGlobalReason('')
      await refresh(signal)
      if (active(signal)) setNotice({ error: false, text: target === 'scene'
        ? controls.scene!.disabled ? 'Scene unblocked.' : 'Scene blocked.'
        : controls.custom!.enabled ? 'Custom shader playback turned off.' : 'Custom shader playback turned on.' })
    } catch (error) {
      if (!active(signal)) return
      if (accessDenied(error) || !mutationAttempted) revokeAccess()
      else {
        setNotice({ error: true, text: error instanceof OperatorRequestError ? error.message : "We couldn't confirm whether your change was saved. Check the current status before trying again." })
        if (error instanceof OperatorRequestError && error.status === 409) {
          try { await refresh(signal) } catch (refreshError) {
            if (active(signal) && accessDenied(refreshError)) revokeAccess()
          }
        }
      }
    } finally {
      // A failed or aborted response may still represent a committed server change.
      if (mutationAttempted && !invalidated) sceneAvailabilityStore.invalidate(target === 'scene' ? sceneId : undefined)
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }

  if (!controls) return null
  const customEnabled = controls.custom?.enabled && controls.custom.releaseApproved
  const activeTool = selectedTool === 'scene' && controls.scene ? 'scene' : controls.custom ? 'global' : 'scene'
  return <>
    <button
      type="button"
      className="scene-availability-admin__trigger"
      aria-label="Open moderation tools"
      title="Moderation tools"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls={isOpen ? dialogId : undefined}
      onClick={() => setIsOpen(true)}
    >
      <Shield size={18} aria-hidden="true" />
    </button>
    {isOpen ? <AvailabilityDialog id={dialogId} onClose={closeDialog}>
      <div className="scene-availability-admin__content" aria-busy={pending}>
        <div className="scene-availability-admin__tool">
          <label htmlFor={toolId}>Manage</label>
          <select id={toolId} value={activeTool} disabled={pending || !controls.scene || !controls.custom} onChange={(event) => {
            setSelectedTool(event.target.value as AvailabilityTool)
            setSceneReason('')
            setGlobalReason('')
            setNotice(null)
          }}>
            {controls.scene ? <option value="scene">This scene</option> : null}
            {controls.custom ? <option value="global">All custom shader scenes</option> : null}
          </select>
        </div>
        <p className="scene-availability-admin__intro">
          {activeTool === 'scene'
            ? 'Blocking this scene stops it from playing for everyone. It stays saved and can be unblocked later.'
            : 'Turn playback on or off for all scenes that use custom shader code. Scenes using built-in templates are not affected.'}
        </p>
        {activeTool === 'scene' && controls.scene ? <form onSubmit={(event) => void handleSubmit(event, 'scene')}>
          <p><strong>{controls.scene.disabled ? 'This scene is blocked.' : 'This scene is not blocked.'}</strong></p>
          <AuditDetails control={controls.scene} />
          <label htmlFor={sceneReasonId}>Why are you making this change?</label>
          <textarea id={sceneReasonId} aria-describedby={reasonHintId} value={sceneReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setSceneReason(event.target.value)} />
          <p id={reasonHintId} className="scene-availability-admin__intro">Required. Only moderators and administrators can see your reason.</p>
          <button type="submit" disabled={pending || !sceneReason.trim()}>{controls.scene.disabled ? 'Unblock scene' : 'Block scene'}</button>
        </form> : null}
        {activeTool === 'global' && controls.custom ? <form onSubmit={(event) => void handleSubmit(event, 'global')}>
          <p><strong>{customEnabled ? 'Custom shader playback is on.' : 'Custom shader playback is off.'}</strong></p>
          {!controls.custom.releaseApproved ? <p>Custom shaders are locked off until MAGE's safety checks are approved. This can't be changed from this window.</p> : null}
          <AuditDetails control={controls.custom} />
          <label htmlFor={globalReasonId}>Why are you making this change?</label>
          <textarea id={globalReasonId} aria-describedby={reasonHintId} value={globalReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setGlobalReason(event.target.value)} />
          <p id={reasonHintId} className="scene-availability-admin__intro">Required. Only moderators and administrators can see your reason.</p>
          <button type="submit" disabled={pending || !globalReason.trim() || (!controls.custom.enabled && !controls.custom.releaseApproved)}>{controls.custom.enabled ? 'Turn off custom shaders' : 'Turn on custom shaders'}</button>
        </form> : null}
        {pending ? <p role="status">Updating…</p> : null}
        {notice ? <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null}
        <button type="button" disabled={pending} onClick={() => void handleRefresh()}>Check current status</button>
      </div>
    </AvailabilityDialog> : null}
  </>
}
