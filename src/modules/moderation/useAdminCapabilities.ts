import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@auth'
import { fetchAdminCapabilities, isModerationAccessDenied, type AdminCapabilities } from './api'

export function useAdminCapabilities() {
  const { authenticatedFetch, accessToken, user, isAuthenticated, isRestoringSession } = useAuth()
  const userId = user?.userId ?? null
  const fetcher = useRef(authenticatedFetch)
  useEffect(() => { fetcher.current = authenticatedFetch }, [authenticatedFetch])
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ token: string; userId: number; attempt: number; capabilities: AdminCapabilities | null; failed: boolean } | null>(null)
  const eligible = isAuthenticated && !isRestoringSession && !!accessToken && userId !== null
  useEffect(() => {
    if (!eligible || !accessToken || userId === null) return
    const controller = new AbortController()
    void fetchAdminCapabilities(fetcher.current, controller.signal).then(capabilities => {
      if (!controller.signal.aborted) setResult({ token: accessToken, userId, attempt, capabilities, failed: false })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ token: accessToken, userId, attempt, capabilities: null, failed: !isModerationAccessDenied(error) })
    })
    return () => controller.abort()
  }, [eligible, accessToken, userId, attempt])
  const current = eligible && result?.token === accessToken && result.userId === userId && result.attempt === attempt ? result : null
  return { capabilities: current?.capabilities ?? null, checking: eligible && !current,
    failed: current?.failed ?? false, refresh: useCallback(() => setAttempt(value => value + 1), []) }
}
