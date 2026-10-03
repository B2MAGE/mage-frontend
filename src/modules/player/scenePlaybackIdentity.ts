import type { MageSceneBlob } from './infrastructure/engineAdapter'
import { hasSceneDocumentMarkers } from './templates/sceneContract'
import { validateSceneForPlayback } from './policy/sceneValidation'

export type MageSceneKey = string | number

// Scene documents are JSON. Only response settings can change without reloading
// geometry/audio; a route identity still distinguishes two identical documents.
export function scenePlaybackIdentity(
  sceneBlob: MageSceneBlob | null | undefined,
  sceneKey?: MageSceneKey,
): string | null {
  if (!sceneBlob) return null
  try {
    const versioned = hasSceneDocumentMarkers(sceneBlob)
    // Validate the complete document before omitting any live-update fields.
    // Otherwise forbidden fields nested in a response config could disappear
    // from comparison and wrongly reuse an already authorized renderer.
    const validated = validateSceneForPlayback(sceneBlob)
    const scene: MageSceneBlob = versioned ? validated : { ...(validated.kind === 'custom' ? validated.scene : validated) }
    if (validated.kind === 'template') {
      delete validated.settings.audioResponse
      delete validated.settings.audioResponseConfig
    } else if (!versioned) {
      delete scene.audioResponse
      delete scene.audioResponseConfig
    }
    return JSON.stringify([sceneKey ?? null, scene], (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      }
      return value
    })
  } catch {
    // Invalid non-JSON documents must take the normal validation/error path.
    return null
  }
}
