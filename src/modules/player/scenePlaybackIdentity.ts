import type { MageSceneBlob } from './infrastructure/engineAdapter'
import { hasSceneDocumentMarkers, parseSceneDocument } from './templates/sceneContract'

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
    const scene: MageSceneBlob = versioned ? parseSceneDocument(sceneBlob) : { ...sceneBlob }
    if (!versioned) {
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
