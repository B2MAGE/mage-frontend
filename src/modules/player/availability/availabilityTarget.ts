import type { SceneAvailabilityTarget } from './sceneAvailability'

/** Saved IDs come from the host route/list, never from submitted scene JSON. */
export function availabilityTarget(sceneKey?: string | number): SceneAvailabilityTarget {
  const id = typeof sceneKey === 'number' ? sceneKey : /^\d+$/.test(sceneKey ?? '') ? Number(sceneKey) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : 'custom'
}
