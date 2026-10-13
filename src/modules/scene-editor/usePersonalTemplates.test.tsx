import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { builderDesign } from './builderDesign'
import { usePersonalTemplates } from './usePersonalTemplates'

const template = { templateId: 7, name: 'Mine', sceneData: builderDesign(createBuilderScene()), thumbnailRef: null, revision: 0, createdAt: '', updatedAt: '' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('usePersonalTemplates', () => {
  it('does not load private templates without a signed-in user', () => {
    const authenticatedFetch = vi.fn()
    const { result } = renderHook(() => usePersonalTemplates({ authenticatedFetch }))
    expect(authenticatedFetch).not.toHaveBeenCalled()
    expect(result.current.templates).toEqual([])
  })

  it('retains the library on a failed write and applies successful rename/delete results', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValueOnce(json([template])).mockResolvedValueOnce(json({ message: 'Name already exists.' }, 409))
      .mockResolvedValueOnce(json({ ...template, name: 'Renamed', revision: 1 })).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { result } = renderHook(() => usePersonalTemplates({ authenticatedFetch, userId: 1 }))
    await waitFor(() => expect(result.current.templates).toHaveLength(1))
    await act(async () => { await expect(result.current.save({ name: 'Mine', sceneData: template.sceneData, thumbnailFile: null })).rejects.toThrow('Name already exists.') })
    expect(result.current.templates).toEqual([template])
    await act(async () => { await result.current.rename(template, 'Renamed') })
    expect(result.current.templates[0].name).toBe('Renamed')
    await act(async () => { await result.current.remove(result.current.templates[0]) })
    expect(result.current.templates).toEqual([])
  })

  it('ignores a stale library response when the signed-in user changes', async () => {
    let resolveOld!: (value: Response) => void
    const authenticatedFetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve })).mockResolvedValue(json([]))
    const { result, rerender } = renderHook(({ userId }) => usePersonalTemplates({ authenticatedFetch, userId }), { initialProps: { userId: 1 } })
    rerender({ userId: 2 })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => resolveOld(json([template])))
    expect(result.current.templates).toEqual([])
  })

  it('reports list failures and allows an explicit retry', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValueOnce(json({ message: 'Temporarily unavailable.' }, 503)).mockResolvedValueOnce(json([template]))
    const { result } = renderHook(() => usePersonalTemplates({ authenticatedFetch, userId: 1 }))
    await waitFor(() => expect(result.current.error).toBe('Temporarily unavailable.'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBeNull()
    expect(result.current.templates).toEqual([template])
  })
})
