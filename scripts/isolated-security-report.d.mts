export const SECURITY_GROUP_CHECK_COUNTS: Readonly<{ boundary: 17; failures: 8; stall: 2 }>
export function createSecurityReport(options?: { now?: () => string; mode?: 'local' | 'deployed' }): {
  start(group: keyof typeof SECURITY_GROUP_CHECK_COUNTS): number
  add(id: number, row: { name: string; outcome: 'PASS' | 'FAIL' | 'PENDING'; evidence: string }): void
  markHidden(id: number): void
  finish(id: number, cancelled?: boolean): void
  snapshot(metadata: { userAgent: string; parentOrigin: string; rendererUrl: string }): {
    version: number
    scope: string
    exportedAt: string
    browserUserAgent: string
    parentOrigin: string
    rendererUrl: string
    retainedRunLimit: number
    expectedChecks: typeof SECURITY_GROUP_CHECK_COUNTS
    runs: Array<{ id: number; group: keyof typeof SECURITY_GROUP_CHECK_COUNTS; startedAt: string; finishedAt: string | null; status: string; interruptedByHiddenPage: boolean; checks: Array<{ name: string; outcome: string; evidence: string }> }>
  }
}
