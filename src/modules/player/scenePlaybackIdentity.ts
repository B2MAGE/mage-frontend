import type { MageSceneBlob } from './infrastructure/engineAdapter'

export type MageSceneKey = string | number

// Scene documents are JSON. Only response settings can change without reloading
// geometry/audio; a route identity still distinguishes two identical documents.
export function scenePlaybackIdentity(
  sceneBlob: MageSceneBlob | null | undefined,
  sceneKey?: MageSceneKey,
): string | null {
  if (!sceneBlob) return null
  const scene = { ...sceneBlob }
  delete scene.audioResponse
  delete scene.audioResponseConfig
  try {
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
