import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type AuthenticatedFetch } from '@auth'
import { fetchAdminCapabilities, fetchModeratorAudit, findModeratorUsers, isExactModeratorQuery, isModerationAccessDenied,
  ModerationRequestError, updateModerator, type ModeratorAuditPage, type ModeratorChange, type ModeratorUser } from './api'
import { useAdminCapabilities } from './useAdminCapabilities'
import './moderation.css'

export function ModeratorsPage() {
  const { accessToken, user, authenticatedFetch } = useAuth()
  const { capabilities, checking, failed, refresh } = useAdminCapabilities()
  return <main className="moderators-page">
    <Link to="/settings">Back to settings</Link>
    <header>
      <h1>Scene moderators</h1>
      <p>Moderators can disable and re-enable individual scenes. They cannot manage other moderators or change platform-wide playback settings.</p>
    </header>
    {checking ? <p role="status">Checking your permissions…</p> : capabilities?.canManageModerators
      ? <ModeratorManagement key={`${accessToken}:${user?.userId}`} fetcher={authenticatedFetch} onAccessLost={refresh} />
      : <section aria-labelledby="moderator-access-title">
        <h2 id="moderator-access-title">{failed ? 'Permissions couldn’t be checked' : 'Administrator access required'}</h2>
        <p>{failed ? 'Please check your connection and try again.' : 'Only an administrator can manage scene moderators.'}</p>
        {failed && <button type="button" className="secondary-button" onClick={refresh}>Try again</button>}
      </section>}
  </main>
}

function ModeratorManagement({ fetcher, onAccessLost }: { fetcher: AuthenticatedFetch; onAccessLost: () => void }) {
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher }, [fetcher])
  const lifetime = useRef(new AbortController())
  const searchRequest = useRef<AbortController | null>(null)
  const auditRequest = useRef<AbortController | null>(null)
  const changing = useRef(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [target, setTarget] = useState<ModeratorUser | null>(null)
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState<ModeratorChange | null>(null)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [history, setHistory] = useState<ModeratorAuditPage | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<number | undefined>()
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => {
      controller.abort()
      searchRequest.current?.abort()
      auditRequest.current?.abort()
    }
  }, [])

  const loadHistory = useCallback(async (beforeId?: number) => {
    auditRequest.current?.abort()
    const controller = new AbortController()
    auditRequest.current = controller
    setHistoryLoading(true)
    setHistoryError(false)
    setHistoryCursor(beforeId)
    try {
      const result = await fetchModeratorAudit(fetcherRef.current, controller.signal, beforeId)
      if (!controller.signal.aborted && !lifetime.current.signal.aborted) setHistory(result)
    } catch (cause) {
      if (controller.signal.aborted || lifetime.current.signal.aborted) return
      if (isModerationAccessDenied(cause)) onAccessLost()
      else setHistoryError(true)
    } finally {
      if (!controller.signal.aborted && !lifetime.current.signal.aborted) setHistoryLoading(false)
    }
  }, [onAccessLost])

  useEffect(() => { void loadHistory() }, [loadHistory])

  useEffect(() => { if (confirmation) confirmButton.current?.focus() }, [confirmation])

  async function findAccount(value: string, afterConflict = false) {
    if (changing.current) return
    searchRequest.current?.abort()
    const controller = new AbortController()
    searchRequest.current = controller
    setTarget(null)
    setConfirmation(null)
    setUncertain(false)
    setError(null)
    setNotice(null)
    setSearched(false)
    setSearching(false)
    if (!isExactModeratorQuery(value)) {
      setError('Enter an exact account ID, @handle, or email address.')
      return
    }
    setSearching(true)
    try {
      const users = await findModeratorUsers(fetcherRef.current, value, controller.signal)
      if (controller.signal.aborted || lifetime.current.signal.aborted) return
      setTarget(users[0] ?? null)
      setSearched(true)
      if (afterConflict) setNotice('The latest status is shown below. Review the account and confirm a new change if needed.')
    } catch (cause) {
      if (controller.signal.aborted || lifetime.current.signal.aborted) return
      if (isModerationAccessDenied(cause)) onAccessLost()
      else setError('The account couldn’t be loaded. Please try searching again.')
    } finally {
      if (!controller.signal.aborted && !lifetime.current.signal.aborted) setSearching(false)
    }
  }

  function search(event: FormEvent) {
    event.preventDefault()
    setReason('')
    void findAccount(query)
  }

  function review(event: FormEvent) {
    event.preventDefault()
    if (!target || target.isAdministrator || changing.current || confirmation || !reason.trim()) return
    setError(null)
    setNotice(null)
    setConfirmation({ enabled: !target.sceneModerator, expectedRevision: target.revision, reason: reason.trim(), requestId: crypto.randomUUID() })
  }

  async function confirmChange() {
    if (!target || target.isAdministrator || !confirmation || changing.current) return
    changing.current = true
    setPending(true)
    setError(null)
    const signal = lifetime.current.signal
    try {
      const caps = await fetchAdminCapabilities(fetcherRef.current, signal)
      if (signal.aborted) return
      if (!caps.canManageModerators) { onAccessLost(); return }
      const updated = await updateModerator(fetcherRef.current, target.userId, confirmation, signal)
      if (signal.aborted) return
      // Idempotent replays return the original snapshot. A newer administrator change may already exist.
      const latest = await findModeratorUsers(fetcherRef.current, String(target.userId), signal)
      if (signal.aborted) return
      setTarget(latest[0] ?? null)
      setConfirmation(null)
      setUncertain(false)
      setReason('')
      setNotice(latest[0]?.sceneModerator === updated.sceneModerator
        ? `${updated.sceneModerator ? 'Granted' : 'Removed'} scene-moderator permission for ${updated.displayName} (account ${updated.userId}).`
        : 'This change was recorded, but the account has changed since then. Review its latest status below.')
      void loadHistory()
    } catch (cause) {
      if (signal.aborted) return
      if (isModerationAccessDenied(cause)) { onAccessLost(); return }
      if (cause instanceof ModerationRequestError && cause.status === 409) {
        changing.current = false
        setConfirmation(null)
        await findAccount(String(target.userId), true)
      } else if (cause instanceof ModerationRequestError && (cause.status === 400 || cause.status === 404)) {
        setTarget(null)
        setConfirmation(null)
        setError('The account or change is no longer available. Search again to review the latest details.')
      } else {
        // Preserve the exact confirmed body, including its request ID, when the outcome is unknown.
        setUncertain(true)
        setError('The result couldn’t be confirmed. Retry this same change safely, or check the latest account status.')
      }
    } finally {
      changing.current = false
      if (!signal.aborted) setPending(false)
    }
  }

  return <>
    <section aria-labelledby="moderator-search-title">
      <h2 id="moderator-search-title">Find an account</h2>
      <form onSubmit={search} className="moderators-search">
        <label htmlFor="moderator-query">Account ID, @handle, or email</label>
        <div className="moderators-actions">
          <input id="moderator-query" value={query} maxLength={320} autoComplete="off" required disabled={pending || !!confirmation}
            onChange={event => setQuery(event.target.value)} aria-describedby="moderator-query-hint" />
          <button className="secondary-button" disabled={searching || pending || !!confirmation} type="submit">{searching ? 'Searching…' : 'Find account'}</button>
        </div>
        <p id="moderator-query-hint" className="moderators-muted">Use the full identifier. Names and partial matches are not searched.</p>
      </form>
      {error && <p role="alert" className="moderators-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {searching && <p role="status">Loading account…</p>}
      {searched && !target && !searching && <p role="status">No account matches that identifier.</p>}
      {target && <section className="moderators-account" aria-labelledby="moderator-account-title">
        <h3 id="moderator-account-title">{target.displayName}</h3>
        <dl className="moderators-identity">
          <div><dt>Account ID</dt><dd>{target.userId}</dd></div>
          <div><dt>Handle</dt><dd>{target.handle ? `@${target.handle}` : 'No handle'}</dd></div>
          <div><dt>Email</dt><dd>{target.email}</dd></div>
          <div><dt>Permission</dt><dd>{target.isAdministrator ? 'Administrator' : target.sceneModerator ? 'Scene moderator' : 'Not a scene moderator'}</dd></div>
        </dl>
        {target.isAdministrator ? <p>Administrator access is managed separately. It cannot be changed here.</p> : <>
          {!confirmation ? <form onSubmit={review}>
            <label htmlFor="moderator-reason">Reason for this change</label>
            <textarea id="moderator-reason" value={reason} maxLength={1000} required onChange={event => setReason(event.target.value)} />
            <button className="secondary-button" type="submit" disabled={!reason.trim()}>{target.sceneModerator ? 'Review removal' : 'Review grant'}</button>
          </form> : <section className="moderators-confirmation" aria-labelledby="moderator-confirm-title" aria-busy={pending}>
            <h3 id="moderator-confirm-title">{confirmation.enabled ? 'Grant scene-moderator permission?' : 'Remove scene-moderator permission?'}</h3>
            <p>{confirmation.enabled ? 'Allow' : 'Stop allowing'} <strong>{target.displayName}</strong> (account {target.userId}, {target.email}) to disable and re-enable individual scenes.</p>
            <p><strong>Reason:</strong> {confirmation.reason}</p>
            <div className="moderators-actions">
              <button className="primary-button" type="button" ref={confirmButton} disabled={pending} onClick={() => void confirmChange()}>
                {pending ? 'Saving…' : uncertain ? 'Retry same change' : confirmation.enabled ? 'Confirm grant' : 'Confirm removal'}
              </button>
              <button className="secondary-button" type="button" disabled={pending} onClick={() => {
                if (uncertain) void findAccount(String(target.userId), true)
                else setConfirmation(null)
              }}>{uncertain ? 'Check latest status' : 'Cancel'}</button>
            </div>
          </section>}
        </>}
      </section>}
    </section>
    <section aria-labelledby="moderator-history-title" aria-busy={historyLoading}>
      <div className="moderators-section-heading"><h2 id="moderator-history-title">Permission history</h2>
        <button type="button" className="secondary-button" disabled={historyLoading} onClick={() => void loadHistory()}>Refresh history</button></div>
      {historyLoading && <p role="status">Loading permission history…</p>}
      {historyError && <p role="alert">Permission history couldn’t be loaded. <button type="button" className="secondary-button" onClick={() => void loadHistory(historyCursor)}>Try again</button></p>}
      {history && !historyError && <>
        {history.entries.length === 0 ? <p>No permission changes have been recorded.</p> : <ol className="moderators-history">{history.entries.map(entry => <li key={entry.id}>
          <strong>Account {entry.targetUserId}: {entry.previousEnabled ? 'Scene moderator' : 'Not a scene moderator'} → {entry.enabled ? 'Scene moderator' : 'Not a scene moderator'}</strong>
          <p className="moderators-muted">{entry.source === 'legacy-allowlist' ? 'Server migration' : `Administrator ${entry.administratorUserId}`} · <time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString()}</time></p>
          <p>{entry.reason}</p>
        </li>)}</ol>}
        <div className="moderators-actions">
          {history.nextCursor !== null && <button type="button" className="secondary-button" disabled={historyLoading} onClick={() => void loadHistory(history.nextCursor!)}>Older changes</button>}
          {historyCursor !== undefined && <button type="button" className="secondary-button" disabled={historyLoading} onClick={() => void loadHistory()}>Latest changes</button>}
        </div>
      </>}
    </section>
  </>
}
