import type { SceneAvailabilityTarget } from './sceneAvailability'
import { validateSceneForStorage } from '../policy/sceneValidation'

function savedSceneId(sceneKey?: string | number) {
  const id = typeof sceneKey === 'number' ? sceneKey : /^\d+$/.test(sceneKey ?? '') ? Number(sceneKey) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Saved IDs come from the host route/list, never from submitted scene JSON. */
export function availabilityTarget(sceneKey?: string | number, sceneBlob?: unknown): SceneAvailabilityTarget {
  const savedId = savedSceneId(sceneKey)
  try {
    // A kind label, preset name, source fingerprint, or recovery identity is
    // never enough. The strict catalog contract must validate the whole input.
    const document = validateSceneForStorage(sceneBlob)
    if (document.kind === 'builder') return savedId === null ? 'draft-builder' : `status:${savedId}`
    if (document.kind === 'template') {
      return savedId === null ? 'draft-template' : `template:${savedId}`
    }
  } catch {
    // Malformed/missing inputs never gain a template permission. The adapter
    // also validates before allocating graphics or replacing a loaded scene.
  }
  return savedId ?? 'custom'
}

/** Metadata-only query for restoring omitted source. Never passed to the adapter. */
export function availabilityStatusTarget(sceneKey?: string | number): SceneAvailabilityTarget {
  const id = savedSceneId(sceneKey)
  return id === null ? 'custom' : `status:${id}`
}
