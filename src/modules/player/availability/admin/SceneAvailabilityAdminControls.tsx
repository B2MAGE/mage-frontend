import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { sceneAvailabilityStore } from '../sceneAvailability'
import {
  fetchCustomControl, fetchSceneControl, isOperatorAccessDenied, OperatorRequestError,
  updateCustomControl, updateSceneControl, type CustomRenderingControl, type SceneControl,
} from './adminApi'
import './sceneAvailabilityAdmin.css'

type Controls = { custom: CustomRenderingControl; scene: SceneControl }

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
  const [authorized, setAuthorized] = useState(false)
  const [pending, setPending] = useState(false)
  const [sceneReason, setSceneReason] = useState('')
  const [globalReason, setGlobalReason] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const sceneReasonId = useId()
  const globalReasonId = useId()

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    void (async () => {
      try {
        const custom = await fetchCustomControl(fetcher, controller.signal)
        if (controller.signal.aborted) return
        const scene = await fetchSceneControl(fetcher, sceneId, controller.signal)
        if (controller.signal.aborted) return
        setControls({ custom, scene })
        setAuthorized(true)
      } catch (error) {
        // Until the server confirms operator access, no management UI or private state is shown.
        if (!controller.signal.aborted && isOperatorAccessDenied(error)) {
          setAuthorized(false)
          setControls(null)
          setSceneReason('')
          setGlobalReason('')
          setNotice(null)
        }
      }
    })()
    return () => controller.abort()
  }, [fetcher, sceneId])

  function revokeAccess() {
    setAuthorized(false)
    setControls(null)
    setSceneReason('')
    setGlobalReason('')
    setNotice(null)
  }

  async function refresh(signal: AbortSignal) {
    const custom = await fetchCustomControl(fetcher, signal)
    const scene = await fetchSceneControl(fetcher, sceneId, signal)
    if (!signal.aborted) setControls({ custom, scene })
  }

  async function handleRefresh() {
    const signal = lifecycle.current?.signal
    if (!signal || signal.aborted || busy.current) return
    busy.current = true
    setPending(true)
    try {
      await refresh(signal)
      if (!signal.aborted) setNotice(null)
    } catch (error) {
      if (signal.aborted) return
      if (isOperatorAccessDenied(error)) revokeAccess()
      else setNotice({ error: true, text: 'Could not refresh playback availability. Try again.' })
    } finally {
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  async function handleSubmit(event: FormEvent, target: 'scene' | 'global') {
    event.preventDefault()
    const signal = lifecycle.current?.signal
    if (!controls || !signal || signal.aborted || busy.current) return
    const reason = (target === 'scene' ? sceneReason : globalReason).trim()
    if (!reason || reason.length > 1000) {
      setNotice({ error: true, text: 'Enter a reason between 1 and 1000 characters.' })
      return
    }
    if (target === 'global' && !controls.custom.enabled && !controls.custom.releaseApproved) return
    busy.current = true
    setPending(true)
    setNotice(null)
    let invalidated = false
    try {
      if (target === 'scene') await updateSceneControl(fetcher, sceneId, !controls.scene.disabled, reason, signal)
      else await updateCustomControl(fetcher, !controls.custom.enabled, reason, signal)
      sceneAvailabilityStore.invalidate(target === 'scene' ? sceneId : undefined)
      invalidated = true
      if (signal.aborted) return
      if (target === 'scene') setSceneReason('')
      else setGlobalReason('')
      await refresh(signal)
      if (!signal.aborted) setNotice({ error: false, text: target === 'scene' ? 'Scene availability updated.' : 'Custom rendering availability updated.' })
    } catch (error) {
      if (signal.aborted) return
      if (isOperatorAccessDenied(error)) revokeAccess()
      else {
        setNotice({ error: true, text: error instanceof OperatorRequestError ? error.message : 'Could not confirm the change. Refresh the status before trying again.' })
        if (error instanceof OperatorRequestError && error.status === 409) {
          try { await refresh(signal) } catch (refreshError) {
            if (!signal.aborted && isOperatorAccessDenied(refreshError)) revokeAccess()
          }
        }
      }
    } finally {
      // A failed or aborted response may still represent a committed server change.
      if (!invalidated) sceneAvailabilityStore.invalidate(target === 'scene' ? sceneId : undefined)
      busy.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  if (!authorized || !controls) return null
  const customEnabled = controls.custom.enabled && controls.custom.releaseApproved
  return <details className="scene-availability-admin">
    <summary>Manage playback availability</summary>
    <div className="scene-availability-admin__content" aria-busy={pending}>
      <p className="scene-availability-admin__intro">Operator controls. Changes apply to everyone. Reasons stay private to operators.</p>
      <form onSubmit={(event) => void handleSubmit(event, 'scene')}>
        <h3>This scene</h3>
        <p>{controls.scene.disabled ? 'Disabled by an operator.' : 'Allowed by scene controls.'}{!customEnabled && !controls.scene.disabled ? ' Custom rendering is currently unavailable.' : ''}</p>
        <AuditDetails control={controls.scene} />
        <label htmlFor={sceneReasonId}>Reason for this scene change</label>
        <textarea id={sceneReasonId} value={sceneReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setSceneReason(event.target.value)} />
        <button type="submit" disabled={pending || !sceneReason.trim()}>{controls.scene.disabled ? 'Re-enable scene' : 'Disable scene'}</button>
      </form>
      <form onSubmit={(event) => void handleSubmit(event, 'global')}>
        <h3>Custom rendering across MAGE</h3>
        <p>{customEnabled ? 'Custom rendering is enabled.' : 'Custom rendering is disabled.'}</p>
        {!controls.custom.releaseApproved ? <p>Enabling is unavailable until the isolation release checks are approved.</p> : null}
        <AuditDetails control={controls.custom} />
        <label htmlFor={globalReasonId}>Reason for the platform change</label>
        <textarea id={globalReasonId} value={globalReason} maxLength={1000} rows={2} disabled={pending} onChange={(event) => setGlobalReason(event.target.value)} />
        <button type="submit" disabled={pending || !globalReason.trim() || (!controls.custom.enabled && !controls.custom.releaseApproved)}>{controls.custom.enabled ? 'Disable custom rendering for everyone' : 'Enable custom rendering'}</button>
      </form>
      {pending ? <p role="status">Updating availability…</p> : null}
      {notice ? <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p> : null}
      <button type="button" disabled={pending} onClick={() => void handleRefresh()}>Refresh status</button>
    </div>
  </details>
}
