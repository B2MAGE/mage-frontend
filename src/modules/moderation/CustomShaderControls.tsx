import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { fetchCustomControl, isOperatorAccessDenied, OperatorRequestError, sceneAvailabilityStore,
  updateCustomControl, type CustomRenderingControl } from '@modules/player'
import { fetchAdminCapabilities, isModerationAccessDenied } from './api'
import './customShaderControls.css'

/** This control independently verifies its scope even when its containing route has already checked access. */
export function CustomShaderControls() {
  const { accessToken, authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  if (!isAuthenticated || isRestoringSession || !accessToken || !user?.userId) return null
  return <VerifiedCustomShaderControls key={`${accessToken}:${user.userId}`} fetcher={authenticatedFetch} />
}

const effectiveEnabled = (value: CustomRenderingControl) => value.enabled && value.releaseApproved
const gateMessage = "Custom shaders are locked off until MAGE's safety checks are approved. This cannot be changed here."
const accessDenied = (error: unknown) => isOperatorAccessDenied(error) || isModerationAccessDenied(error)

function VerifiedCustomShaderControls({ fetcher }: { fetcher: AuthenticatedFetch }) {
  const [control, setControl] = useState<CustomRenderingControl | null>(null)
  const [status, setStatus] = useState<'checking' | 'ready' | 'denied' | 'error'>('checking')
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const fetcherRef = useRef(fetcher)
  const titleId = useId(), descriptionId = useId(), reasonId = useId(), reasonHintId = useId(), gateId = useId()
  useEffect(() => { fetcherRef.current = fetcher }, [fetcher])

  const active = useCallback((signal: AbortSignal) => !signal.aborted && lifecycle.current?.signal === signal, [])
  const clear = useCallback((next: 'checking' | 'denied' | 'error') => {
    setControl(null)
    setDraftEnabled(false)
    setReason('')
    setStatus(next)
  }, [])
  const apply = useCallback((value: CustomRenderingControl) => {
    setControl(value)
    setDraftEnabled(value.enabled)
    setReason('')
    setStatus('ready')
  }, [])

  const verify = useCallback(async (signal: AbortSignal) => {
    const capabilities = await fetchAdminCapabilities(fetcherRef.current, signal)
    if (!active(signal)) return null
    if (!capabilities.canManageCustomRendering) { clear('denied'); return null }
    const value = await fetchCustomControl(fetcherRef.current, signal)
    if (!active(signal)) return null
    apply(value)
    return value
  }, [active, apply, clear])

  const refresh = useCallback(async () => {
    const signal = lifecycle.current?.signal
    if (!signal || !active(signal) || busy.current) return
    busy.current = true
    setPending(true)
    setNotice(null)
    clear('checking')
    try { await verify(signal) }
    catch (error) {
      if (active(signal)) clear(accessDenied(error) ? 'denied' : 'error')
    } finally {
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }, [active, clear, verify])

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    busy.current = false
    void refresh()
    const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  async function save(event: FormEvent) {
    event.preventDefault()
    const signal = lifecycle.current?.signal
    const trimmedReason = reason.trim()
    if (!control || !signal || !active(signal) || busy.current || !trimmedReason || trimmedReason.length > 1000
      || draftEnabled === control.enabled || (draftEnabled && !control.releaseApproved)) return
    const desired = draftEnabled
    busy.current = true
    setPending(true)
    setNotice(null)
    let mutationAttempted = false
    let invalidated = false
    try {
      const capabilities = await fetchAdminCapabilities(fetcherRef.current, signal)
      if (!active(signal)) return
      if (!capabilities.canManageCustomRendering) { clear('denied'); return }
      // Recheck the release gate immediately before saving; the backend also enforces it on the write.
      const latest = await fetchCustomControl(fetcherRef.current, signal)
      if (!active(signal)) return
      if (desired && !latest.releaseApproved) {
        apply(latest)
        setNotice({ error: true, text: gateMessage })
        return
      }
      mutationAttempted = true
      await updateCustomControl(fetcherRef.current, desired, trimmedReason, signal)
      sceneAvailabilityStore.invalidate()
      invalidated = true
      if (!active(signal)) return
      clear('checking')
      const saved = await verify(signal)
      if (saved && active(signal)) setNotice({ error: false, text: effectiveEnabled(saved) === desired
        ? `Custom shader playback turned ${desired ? 'on' : 'off'}.`
        : 'The status changed again. The latest saved status is shown.' })
    } catch (error) {
      if (!active(signal)) return
      if (accessDenied(error)) { clear('denied'); return }
      clear('error')
      if (mutationAttempted && error instanceof OperatorRequestError && error.status === 409) {
        try {
          await verify(signal)
          if (active(signal)) setNotice({ error: true, text: gateMessage })
        } catch (refreshError) {
          if (active(signal)) clear(accessDenied(refreshError) ? 'denied' : 'error')
        }
      } else if (mutationAttempted) {
        setNotice({ error: true, text: "We couldn't confirm whether your change was saved. Check the current status before trying again." })
      }
    } finally {
      // A lost or aborted response can still mean the server committed the global change.
      if (mutationAttempted && !invalidated) sceneAvailabilityStore.invalidate()
      if (active(signal)) { busy.current = false; setPending(false) }
    }
  }

  const changed = control !== null && draftEnabled !== control.enabled
  return <section className="custom-shader-controls" aria-labelledby={titleId} aria-busy={pending}>
    <h2 id={titleId}>Custom shader playback</h2>
    <p id={descriptionId}>Turn playback on or off for scenes that use custom shader code across MAGE. Scenes using built-in templates are not affected.</p>
    {status === 'checking' && <p role="status">Checking current playback settings…</p>}
    {status === 'denied' && <p role="status">Administrator permission is required to manage custom shader playback.</p>}
    {status === 'error' && <p role="alert">The current playback settings couldn’t be verified. Please check again.</p>}
    {status === 'ready' && control && <>
      <p className="custom-shader-controls__saved"><strong>Saved status: {effectiveEnabled(control) ? 'On' : 'Off'}</strong></p>
      {!control.releaseApproved && <div id={gateId}>
        <p>{gateMessage}</p>
        {control.enabled && <p>An on setting is saved, but playback is locked off. Turn this off and save to cancel it.</p>}
      </div>}
      <form onSubmit={event => void save(event)}>
        <label className="custom-shader-controls__toggle">
          <span>Allow custom shader playback</span>
          <input type="checkbox" role="switch" aria-label="Allow custom shader playback" aria-describedby={`${descriptionId}${!control.releaseApproved ? ` ${gateId}` : ''}`}
            checked={draftEnabled} disabled={pending || (!control.releaseApproved && !draftEnabled)}
            onChange={event => {
              if (event.target.checked && !control.releaseApproved) return
              setDraftEnabled(event.target.checked)
              setNotice(null)
            }} />
          <span className="custom-shader-controls__track" aria-hidden="true"><span /></span>
        </label>
        {changed && <>
          <p className="custom-shader-controls__hint">Not saved yet. Add a reason and select Save change to turn playback {draftEnabled ? 'on' : 'off'}.</p>
          <label htmlFor={reasonId}>Why are you making this change?</label>
          <textarea id={reasonId} value={reason} maxLength={1000} rows={3} required aria-describedby={reasonHintId}
            disabled={pending} onChange={event => setReason(event.target.value)} />
          <p id={reasonHintId} className="custom-shader-controls__hint">Required. Only administrators can see your reason.</p>
          <button type="submit" className="primary-button" disabled={pending || !reason.trim() || (draftEnabled && !control.releaseApproved)}>
            {pending ? 'Saving…' : 'Save change'}
          </button>
        </>}
      </form>
      {control.changedAt && <div className="custom-shader-controls__audit">
        <p>Last changed <time dateTime={control.changedAt}>{new Date(control.changedAt).toLocaleString()}</time>{control.changedByUserId ? ` by account #${control.changedByUserId}` : ''}.</p>
        {control.reason && <p>Previous reason: {control.reason}</p>}
      </div>}
    </>}
    {notice && status !== 'denied' && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {status !== 'denied' && <button type="button" className="secondary-button" disabled={pending} onClick={() => void refresh()}>Check current status</button>}
  </section>
}
