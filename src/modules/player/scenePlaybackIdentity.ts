import type { MageSceneBlob } from './infrastructure/engineAdapter'
import { sceneStructuralContent } from './liveSceneSettings'

export type MageSceneKey = string | number

// Only fully validated live settings are omitted. Source/template/resource and
// starting runtime state changes still load; routes distinguish identical scenes.
export function scenePlaybackIdentity(
  sceneBlob: MageSceneBlob | null | undefined,
  sceneKey?: MageSceneKey,
): string | null {
  if (!sceneBlob) return null
  try {
    const scene = sceneStructuralContent(sceneBlob)
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
