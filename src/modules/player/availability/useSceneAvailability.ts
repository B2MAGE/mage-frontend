import { useCallback, useSyncExternalStore } from 'react'
import { sceneAvailabilityStore, type SceneAvailabilityTarget } from './sceneAvailability'

export function useSceneAvailability(target: SceneAvailabilityTarget) {
  const subscribe = useCallback((listener: () => void) => sceneAvailabilityStore.subscribe(target, listener), [target])
  const getSnapshot = useCallback(() => sceneAvailabilityStore.getSnapshot(target), [target])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
