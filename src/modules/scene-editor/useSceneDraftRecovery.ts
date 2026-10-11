import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createSceneDraftRecovery, type SceneDraftSaveContext, type SceneDraftSnapshot } from './sceneDraftRecovery'

type Args = {
  storageKey: string | null
  snapshot: SceneDraftSnapshot
  baseFingerprint: string
  saveContext?: SceneDraftSaveContext
}

export function useSceneDraftRecovery({ storageKey, snapshot, baseFingerprint, saveContext }: Args) {
  const recovery = useMemo(() => createSceneDraftRecovery(storageKey), [storageKey])
  const view = useSyncExternalStore(recovery.subscribe, recovery.getSnapshot, recovery.getSnapshot)
  useEffect(() => {
    recovery.update({ snapshot, baseFingerprint, saveContext })
  }, [recovery, snapshot, baseFingerprint, saveContext])
  useEffect(() => {
    window.addEventListener('storage', recovery.onStorage)
    window.addEventListener('pagehide', recovery.flush)
    return () => {
      window.removeEventListener('storage', recovery.onStorage)
      window.removeEventListener('pagehide', recovery.flush)
      recovery.dispose()
    }
  }, [recovery])
  return { ...view, restore: recovery.restore, discard: recovery.discard,
    keepCurrent: recovery.keepCurrent, clearAfterSave: recovery.clearAfterSave,
    persistSaveContext: recovery.persistSaveContext }
}
