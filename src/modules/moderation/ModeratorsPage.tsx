import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type AuthenticatedFetch } from '@auth'
import {
  ActionButton,
  FormNotice,
  PageFrame,
  PageHeader,
  PagePanel,
  PageState,
  SectionHeader,
} from '@shared/ui'
import { fetchAdminCapabilities, fetchModeratorAudit, findModeratorUsers, isExactModeratorQuery, isModerationAccessDenied,
  ModerationRequestError, updateModerator, type ModeratorAuditPage, type ModeratorChange, type ModeratorUser } from './api'
import { useAdminCapabilities } from './useAdminCapabilities'
import './moderation.css'

export function ModeratorsPage({ embedded = false }: { embedded?: boolean }) {
  const { accessToken, user, authenticatedFetch } = useAuth()
  const { capabilities, checking, failed, refresh } = useAdminCapabilities()
  const content = (
    <PagePanel className="moderation-tool moderation-area__moderators">
      {embedded ? (
        <SectionHeader
          description="Add or remove people who can block and unblock scenes. Only administrators can manage this access."
          title="Moderator access"
        />
      ) : null}
      {checking ? (
        <FormNotice tone="note">Checking your permissions…</FormNotice>
      ) : capabilities?.canManageModerators ? (
        <ModeratorManagement
          fetcher={authenticatedFetch}
          key={`${accessToken}:${user?.userId}`}
          onAccessLost={refresh}
        />
      ) : (
        <PageState
          actions={failed ? (
            <ActionButton onClick={refresh} tone="secondary">Try again</ActionButton>
          ) : undefined}
          description={failed
            ? 'Please check your connection and try again.'
            : 'Only an administrator can manage scene moderators.'}
          kind="error"
          title={failed ? 'Permissions couldn’t be checked' : 'Administrator access required'}
        />
      )}
    </PagePanel>
  )

  if (embedded) {
    return content
  }

  return (
    <PageFrame className="moderators-page" width="form">
      <Link className="ui-button ui-button--ghost moderators-page__back" to="/moderation">
        Back to moderation
      </Link>
      <PageHeader
        description="Add or remove people who can block and unblock scenes. Only administrators can manage moderators or change custom shader playback for everyone."
        title="Moderator access"
      />
      {content}
    </PageFrame>
  )
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

  return <div className="moderator-management">
    <PagePanel as="section" className="moderator-management__section" padding="compact" tone="nested" aria-labelledby="moderator-search-title">
      <SectionHeader
        description="Search by one complete identifier before reviewing or changing access."
        title="Find an account"
        titleId="moderator-search-title"
      />
      <form onSubmit={search} className="moderators-search">
        <div className="ui-field">
          <label htmlFor="moderator-query">Account ID, @handle, or email</label>
          <div className="moderation-action-row">
            <input id="moderator-query" value={query} maxLength={320} autoComplete="off" required disabled={pending || !!confirmation}
              onChange={event => setQuery(event.target.value)} aria-describedby="moderator-query-hint" />
            <ActionButton disabled={searching || pending || !!confirmation} tone="secondary" type="submit">{searching ? 'Searching…' : 'Find account'}</ActionButton>
          </div>
          <p id="moderator-query-hint" className="field-hint">Use the full identifier. Names and partial matches are not searched.</p>
        </div>
      </form>
      {error && <FormNotice tone="error">{error}</FormNotice>}
      {notice && <FormNotice tone="note">{notice}</FormNotice>}
      {searching && <FormNotice tone="note">Loading account…</FormNotice>}
      {searched && !target && !searching && <FormNotice tone="note">No account matches that identifier.</FormNotice>}
      {target && <PagePanel className="moderators-account" padding="compact" tone="quiet" aria-labelledby="moderator-account-title">
        <h3 id="moderator-account-title">{target.displayName}</h3>
        <dl className="moderators-identity">
          <div><dt>Account ID</dt><dd>{target.userId}</dd></div>
          <div><dt>Handle</dt><dd>{target.handle ? `@${target.handle}` : 'No handle'}</dd></div>
          <div><dt>Email</dt><dd>{target.email}</dd></div>
          <div><dt>Permission</dt><dd>{target.isAdministrator ? 'Administrator' : target.sceneModerator ? 'Scene moderator' : 'Not a scene moderator'}</dd></div>
        </dl>
        {target.isAdministrator ? <p>Administrator access is managed separately. It cannot be changed here.</p> : <>
          {!confirmation ? <form className="moderators-review-form" onSubmit={review}>
            <div className="ui-field">
              <label htmlFor="moderator-reason">Reason for this change</label>
              <textarea id="moderator-reason" value={reason} maxLength={1000} required onChange={event => setReason(event.target.value)} />
            </div>
            <ActionButton tone="secondary" type="submit" disabled={!reason.trim()}>{target.sceneModerator ? 'Review removal' : 'Review grant'}</ActionButton>
          </form> : <PagePanel className="moderators-confirmation" padding="compact" tone="nested" aria-labelledby="moderator-confirm-title" aria-busy={pending}>
            <h3 id="moderator-confirm-title">{confirmation.enabled ? 'Grant scene-moderator permission?' : 'Remove scene-moderator permission?'}</h3>
            <p>{confirmation.enabled ? 'Allow' : 'Stop allowing'} <strong>{target.displayName}</strong> (account {target.userId}, {target.email}) to disable and re-enable individual scenes.</p>
            <p><strong>Reason:</strong> {confirmation.reason}</p>
            <div className="moderation-action-row">
              <ActionButton tone="primary" type="button" ref={confirmButton} disabled={pending} onClick={() => void confirmChange()}>
                {pending ? 'Saving…' : uncertain ? 'Retry same change' : confirmation.enabled ? 'Confirm grant' : 'Confirm removal'}
              </ActionButton>
              <ActionButton tone="secondary" type="button" disabled={pending} onClick={() => {
                if (uncertain) void findAccount(String(target.userId), true)
                else setConfirmation(null)
              }}>{uncertain ? 'Check latest status' : 'Cancel'}</ActionButton>
            </div>
          </PagePanel>}
        </>}
      </PagePanel>}
    </PagePanel>
    <PagePanel as="section" className="moderator-management__section" padding="compact" tone="nested" aria-labelledby="moderator-history-title" aria-busy={historyLoading}>
      <SectionHeader
        actions={<ActionButton size="compact" tone="secondary" disabled={historyLoading} onClick={() => void loadHistory()}>Refresh history</ActionButton>}
        title="Permission history"
        titleId="moderator-history-title"
      />
      {historyLoading && <FormNotice tone="note">Loading permission history…</FormNotice>}
      {historyError && <FormNotice tone="error">Permission history couldn’t be loaded. <ActionButton size="compact" tone="secondary" onClick={() => void loadHistory(historyCursor)}>Try again</ActionButton></FormNotice>}
      {history && !historyError && <>
        {history.entries.length === 0 ? <FormNotice tone="note">No permission changes have been recorded.</FormNotice> : <ol className="moderators-history">{history.entries.map(entry => <li key={entry.id}>
          <strong>Account {entry.targetUserId}: {entry.previousEnabled ? 'Scene moderator' : 'Not a scene moderator'} → {entry.enabled ? 'Scene moderator' : 'Not a scene moderator'}</strong>
          <p className="moderators-muted">{entry.source === 'legacy-allowlist' ? 'Server migration' : `Administrator ${entry.administratorUserId}`} · <time dateTime={entry.changedAt}>{new Date(entry.changedAt).toLocaleString()}</time></p>
          <p>{entry.reason}</p>
        </li>)}</ol>}
        <div className="moderation-action-row">
          {history.nextCursor !== null && <ActionButton type="button" tone="secondary" disabled={historyLoading} onClick={() => void loadHistory(history.nextCursor!)}>Older changes</ActionButton>}
          {historyCursor !== undefined && <ActionButton type="button" tone="secondary" disabled={historyLoading} onClick={() => void loadHistory()}>Latest changes</ActionButton>}
        </div>
      </>}
    </PagePanel>
  </div>
}
