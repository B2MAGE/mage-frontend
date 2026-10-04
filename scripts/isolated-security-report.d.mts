export const SECURITY_GROUP_CHECK_COUNTS: Readonly<{ boundary: 17; failures: 8; stall: 2 }>
export const SECURITY_DIAGNOSTIC_LIMIT: 256
export const SECURITY_TEST_VERSION: 'fixed-security-2'
export type DiagnosticPhase = 'baseline-startup' | 'baseline' | 'stall-startup' | 'stall' | 'recovery' | 'cleanup'
type FailureReason = 'runtime' | 'context-lost' | 'startup-timeout' | 'progress-timeout' | 'compile'
export type SecurityDiagnostic = { phase: DiagnosticPhase; atMs: number } & (
  { type: 'phase' | 'progress' } |
  { type: 'status'; status: 'starting' | 'ready' | 'loading' | 'playing' | 'paused' | 'error' | 'disposed' } |
  { type: 'watchdog'; deltaMs: number; silenceMs: number; progressAgeMs: number; resetReason: 'closed' | 'not-loaded' | 'paused' | 'hidden' | 'invalid-clock' | 'parent-gap' | 'recent-progress' | 'none' } |
  { type: 'failure'; reason: FailureReason } |
  { type: 'marker'; marker: 'queued' | 'scheduled' | 'start' | 'end'; childAtMs: number } |
  { type: 'parent-timer'; gapMs: number } |
  { type: 'visibility'; state: 'visible' | 'hidden' }
)
export type StallObservation = { elapsedMs: number; maxParentGapMs: number; failureReason: FailureReason | null; failureCallbackAtMs: number | null;
  iframeConnected: boolean; markerQueued: boolean; markerScheduled: boolean; markerStarted: boolean; markerEnded: boolean }
export type StallObservations = { baseline: StallObservation | null; observation: StallObservation | null; recovery: StallObservation | null; beforeCleanup: StallObservation | null }
export function createSecurityReport(options?: { now?: () => string; mode?: 'local' | 'deployed' }): {
  start(group: keyof typeof SECURITY_GROUP_CHECK_COUNTS): number
  add(id: number, row: { name: string; outcome: 'PASS' | 'FAIL' | 'PENDING'; evidence: string }): void
  markHidden(id: number): void
  diagnostic(id: number, event: SecurityDiagnostic): void
  observeStall(id: number, phase: keyof StallObservations, observation: StallObservation): void
  finish(id: number, cancelled?: boolean): void
  snapshot(metadata: { userAgent: string; parentOrigin: string; rendererUrl: string }): {
    version: number
    testVersion: string
    scope: string
    exportedAt: string
    browserUserAgent: string
    parentOrigin: string
    rendererUrl: string
    retainedRunLimit: number
    expectedChecks: typeof SECURITY_GROUP_CHECK_COUNTS
    stallParameters: { baselineObservationMs: number; stallObservationMs: number; recoveryObservationMs: number; childDelayMs: number; childLoopMs: number;
      parentTimerIntervalMs: number; parentResponsivenessLimitMs: number; fixtureProgressTimeoutMs: number; fixtureStartupTimeoutMs: number; productionDefaultProgressTimeoutMs: number }
    runs: Array<{ id: number; group: keyof typeof SECURITY_GROUP_CHECK_COUNTS; startedAt: string; finishedAt: string | null; status: string; interruptedByHiddenPage: boolean;
      checks: Array<{ name: string; outcome: string; evidence: string }>;
      diagnostics?: { eventLimit: number; events: SecurityDiagnostic[]; truncated: boolean; droppedEvents: number; rejectedEvents: number }; stall?: StallObservations }>
  }
}
