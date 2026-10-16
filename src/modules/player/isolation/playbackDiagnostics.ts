import type { PlaybackHostDiagnostic } from './playbackHost'

const MAX_SESSIONS = 8, MAX_EVENTS = 80
type Report = { session: number; startedAt: string; events: PlaybackHostDiagnostic[]
  lastProgress: number | null; watchdog: Extract<PlaybackHostDiagnostic, { type: 'watchdog' }> | null }
const reports = new Map<number, Report>()
let sequence = 0

/** Page-local, bounded evidence. Never includes submitted scenes, media, URLs or raw errors. */
export function createPlaybackDiagnostics() {
  const session = ++sequence
  const report: Report = { session, startedAt: new Date().toISOString(), events: [], lastProgress: null, watchdog: null }
  reports.set(session, report)
  if (reports.size > MAX_SESSIONS) reports.delete(reports.keys().next().value!)
  return (event: PlaybackHostDiagnostic) => {
    if (event.type === 'progress') { report.lastProgress = event.at; return }
    if (event.type === 'watchdog') { report.watchdog = { ...event }; return }
    // Inspector polling must not evict the history of scene preparation.
    if (event.type === 'operation' && event.operation === 'audio-inspector' && event.phase !== 'failed') return
    report.events.push({ ...event })
    if (report.events.length > MAX_EVENTS) report.events.shift()
  }
}

export function readPlaybackDiagnostics() {
  return { version: 1, sessions: Array.from(reports.values(), report => ({ ...report,
    watchdog: report.watchdog ? { ...report.watchdog } : null, events: report.events.map(event => ({ ...event })) })) }
}

export function downloadPlaybackDiagnostics() {
  const blob = new Blob([JSON.stringify(readPlaybackDiagnostics(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = 'mage-playback-report.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
