import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import { deletePersonalTemplate, fetchPersonalTemplate, fetchPersonalTemplates, renamePersonalTemplate, savePersonalTemplate,
  type PersonalTemplate, type SavePersonalTemplate } from './personalTemplates'

type Args = { authenticatedFetch: AuthenticatedFetch; userId?: number | null }

export function usePersonalTemplates({ authenticatedFetch, userId }: Args) {
  const [templates, setTemplates] = useState<PersonalTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useRef(0)
  const request = useRef<AbortController | null>(null)
  const listRequest = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (userId == null) return
    listRequest.current?.abort()
    const controller = new AbortController()
    listRequest.current = controller
    const started = session.current
    setIsLoading(true)
    setError(null)
    try {
      const loaded = await fetchPersonalTemplates(authenticatedFetch, controller.signal)
      if (!controller.signal.aborted && started === session.current) setTemplates(loaded)
    } catch (cause) {
      if (!controller.signal.aborted && started === session.current) setError(cause instanceof Error ? cause.message : 'Your templates could not be loaded.')
    } finally {
      if (!controller.signal.aborted && started === session.current) setIsLoading(false)
    }
  }, [authenticatedFetch, userId])

  useEffect(() => {
    session.current += 1
    setTemplates([])
    setError(null)
    setIsLoading(false)
    setIsBusy(false)
    void refresh()
    return () => {
      session.current += 1
      request.current?.abort()
      request.current = null
      listRequest.current?.abort()
    }
  }, [refresh])

  const perform = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>, apply: (result: T) => void) => {
    if (userId == null) throw new Error('Sign in to use your templates.')
    if (request.current) throw new Error('Wait for the current template action to finish.')
    const controller = new AbortController()
    request.current = controller
    const started = session.current
    setIsBusy(true)
    try {
      const result = await operation(controller.signal)
      controller.signal.throwIfAborted()
      if (started !== session.current) throw new Error('The signed-in account changed. Open your templates again.')
      listRequest.current?.abort()
      setIsLoading(false)
      apply(result)
      setError(null)
      return result
    } finally {
      if (started === session.current) { request.current = null; setIsBusy(false) }
    }
  }, [userId])

  const remember = useCallback((template: PersonalTemplate) => {
    setTemplates(current => [template, ...current.filter(item => item.templateId !== template.templateId)]
      .sort((a, b) => a.name.localeCompare(b.name)))
  }, [])
  const load = useCallback((templateId: number) => perform(signal => fetchPersonalTemplate(authenticatedFetch, templateId, signal), remember), [authenticatedFetch, perform, remember])
  const save = useCallback((input: SavePersonalTemplate) => perform(signal => savePersonalTemplate(authenticatedFetch, input, signal), remember), [authenticatedFetch, perform, remember])
  const rename = useCallback((template: PersonalTemplate, name: string) => perform(signal => renamePersonalTemplate(authenticatedFetch, template, name, signal), remember), [authenticatedFetch, perform, remember])
  const remove = useCallback((template: PersonalTemplate) => perform(signal => deletePersonalTemplate(authenticatedFetch, template, signal), () => {
    setTemplates(current => current.filter(item => item.templateId !== template.templateId))
  }), [authenticatedFetch, perform])

  return { templates, isLoading, isBusy, error, refresh, load, save, rename, remove }
}
