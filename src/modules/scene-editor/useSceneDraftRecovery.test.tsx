import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { parseSceneDraftRecord, sceneDraftFingerprint, type SceneDraftSnapshot } from './sceneDraftRecovery'
import { useSceneDraftRecovery } from './useSceneDraftRecovery'

function snapshot(name = 'Base'): SceneDraftSnapshot {
  const sceneData = createBuilderScene()
  return { name, description: '', sceneData, sceneDataText: JSON.stringify(sceneData),
    selectedTagIds: [], selectedBuilderObjectId: null }
}

describe('browser draft recovery lifecycle', () => {
  let values: Map<string, string>
  beforeEach(() => {
    vi.useFakeTimers()
    values = new Map()
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) } } as Storage
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(storage)
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

  it('flushes the latest draft on pagehide and unmount before the debounce expires', () => {
    const base = snapshot()
    const hook = renderHook(({ draft }) => useSceneDraftRecovery({ storageKey: 'test', snapshot: draft,
      baseFingerprint: sceneDraftFingerprint(base) }), { initialProps: { draft: base } })
    hook.rerender({ draft: snapshot('Page hidden') })
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(parseSceneDraftRecord(values.get('test')!)?.snapshot.name).toBe('Page hidden')
    hook.rerender({ draft: snapshot('Unmounted') })
    hook.unmount()
    expect(parseSceneDraftRecord(values.get('test')!)?.snapshot.name).toBe('Unmounted')
  })

  it('flushes only the old account’s state when switching storage scopes', () => {
    const base = snapshot()
    const hook = renderHook(({ storageKey, draft }) => useSceneDraftRecovery({ storageKey, snapshot: draft,
      baseFingerprint: sceneDraftFingerprint(base) }), { initialProps: { storageKey: 'account-a', draft: snapshot('Account A') } })
    hook.rerender({ storageKey: 'account-b', draft: snapshot('Account B') })
    expect(parseSceneDraftRecord(values.get('account-a')!)?.snapshot.name).toBe('Account A')
    expect(hook.result.current.candidate).toBeNull()
    hook.unmount()
    expect(parseSceneDraftRecord(values.get('account-b')!)?.snapshot.name).toBe('Account B')
  })

  it('does not continually rewrite the same draft after status updates rerender a fresh snapshot object', () => {
    const hook = renderHook(() => useSceneDraftRecovery({ storageKey: 'test', snapshot: snapshot('Draft'),
      baseFingerprint: sceneDraftFingerprint(snapshot()) }))
    act(() => vi.advanceTimersByTime(400))
    const savedAt = parseSceneDraftRecord(values.get('test')!)!.savedAt
    act(() => vi.advanceTimersByTime(2000))
    expect(parseSceneDraftRecord(values.get('test')!)!.savedAt).toBe(savedAt)
    expect(hook.result.current.status.kind).toBe('saved')
  })
})
