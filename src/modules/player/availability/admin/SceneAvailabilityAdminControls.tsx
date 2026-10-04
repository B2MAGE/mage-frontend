import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { sceneAvailabilityStore } from '../sceneAvailability'
import { fetchAdminCapabilities, isModerationAccessDenied, type AdminCapabilities } from '@modules/moderation'
import {
  fetchCustomControl, fetchSceneControl, isOperatorAccessDenied, OperatorRequestError,
  updateCustomControl, updateSceneControl, type CustomRenderingControl, type SceneControl,
} from './adminApi'
import './sceneAvailabilityAdmin.css'

type Controls = { capabilities: AdminCapabilities; custom: CustomRenderingControl | null; scene: SceneControl | null }

export function SceneAvailabilityAdminControls({ sceneId }: { sceneId: number }) {
  const { accessToken, authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  if (!isAuthenticated || isRestoringSession || !accessToken || !user?.userId) return null
  return <OperatorControls key={`${accessToken}:${user.userId}:${sceneId}`} sceneId={sceneId} fetcher={authenticatedFetch} />
}

function AuditDetails({ control }: { control: SceneControl | CustomRenderingControl }) {
  if (!control.changedAt) return <p className="scene-availability-admin__audit">No operator changes recorded.</p>
  return <div className="scene-availability-admin__audit">
    <p>Last changed {new Date(control.changedAt).toLocaleString()}{control.changedByUserId ? ` by operator #${control.changedByUserId}` : ''}.</p>
    <p>Reason: {control.reason}</p>
  </div>
}

function OperatorControls({ sceneId, fetcher }: { sceneId: number; fetcher: AuthenticatedFetch }) {
  const [controls, setControls] = useState<Controls | null>(null)
  const [pending, setPending] = useState(false)
  const [sceneReason, setSceneReason] = useState('')
  const [globalReason, setGlobalReason] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const sceneReasonId = useId()
  const globalReasonId = useId()

  function revokeAccess() {
    setControls(null)
    setSceneReason('')
    setGlobalReason('')
    setNotice(null)
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

  async function handleSubmit(event: FormEvent, target: 'scene' | 'global') {
    event.preventDefault()
    const signal = lifecycle.current?.signal
    if (!controls || !signal || !active(signal) || busy.current) return
    if (target === 'scene' ? !controls.scene || !controls.capabilities.canModerateScenes
      : !controls.custom || !controls.capabilities.canManageCustomRendering) return
    const reason = (target === 'scene' ? sceneReason : globalReason).trim()
    if (!reason || reason.length > 1000) {
      setNotice({ error: true, text: 'Enter a reason between 1 and 1000 characters.' })
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
      if (active(signal)) setNotice({ error: false, text: target === 'scene' ? 'Scene availability updated.' : 'Custom rendering availability updated.' })
    } catch (error) {
      if (!active(signal)) return
      if (accessDenied(error) || !mutationAttempted) revokeAccess()
      else {
        setNotice({ error: true, text: error instanceof OperatorRequestError ? error.message : 'Could not confirm the change. Refresh the status before trying again.' })
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
  return <details className="scene-availability-admin">
    <summary>Manage playback availability</summary>
    <div className="scene-availability-admin__content" aria-busy={pending}>
      <p className="scene-availability-admin__intro">Operator controls. Changes apply to everyone. Reasons stay private to operators.</p>
      {controls.scene ? <form onSubmit={(event) => void handleSubmit(event, 'scene')}>
        <h3>This scene</h3>
        <p>{controls.scene.disabled ? 'Disabled by an operator.' : 'Allowed by scene controls.'}</p>
        <AuditDetails control={controls.scene} />
        <label htmlFor={sceneReasonId}>Reason for this scene change</label>
        <textarea id={sceneReasonId} value={sceneReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setSceneReason(event.target.value)} />
        <button type="submit" disabled={pending || !sceneReason.trim()}>{controls.scene.disabled ? 'Re-enable scene' : 'Disable scene'}</button>
      </form> : null}
      {controls.custom ? <form onSubmit={(event) => void handleSubmit(event, 'global')}>
        <h3>Custom rendering across MAGE</h3>
        <p>{customEnabled ? 'Custom rendering is enabled.' : 'Custom rendering is disabled.'}</p>
        {!controls.custom.releaseApproved ? <p>Enabling is unavailable until the isolation release checks are approved.</p> : null}
        <AuditDetails control={controls.custom} />
        <label htmlFor={globalReasonId}>Reason for the platform change</label>
        <textarea id={globalReasonId} value={globalReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setGlobalReason(event.target.value)} />
        <button type="submit" disabled={pending || !globalReason.trim() || (!controls.custom.enabled && !controls.custom.releaseApproved)}>{controls.custom.enabled ? 'Disable custom rendering for everyone' : 'Enable custom rendering'}</button>
      </form> : null}
      {pending ? <p role="status">Updating availability…</p> : null}
      {notice ? <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null}
      <button type="button" disabled={pending} onClick={() => void handleRefresh()}>Refresh status</button>
    </div>
  </details>
}
