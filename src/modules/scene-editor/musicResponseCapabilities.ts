import { scenePlaybackIdentity, type MagePlayerAudioResponseCapabilitiesSnapshot } from '@modules/player'
import type { AudioResponseTarget } from '@shared/lib'
import type { SceneData } from './sceneEditor'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Compare source ownership only. Never inspect source text for supported inputs,
// and never validate away a numeric draft that the creator still needs to repair.
function sourceIdentity(document: SceneData): string | null {
  if (document.kind === 'template') {
    return document.schemaVersion === 1 && typeof document.templateId === 'string'
      && typeof document.templateVersion === 'number'
      ? JSON.stringify(['template', document.templateId, document.templateVersion]) : null
  }
  const scene = document.kind === 'custom' && document.schemaVersion === 1
    ? document.scene
    : Object.hasOwn(document, 'kind') || Object.hasOwn(document, 'schemaVersion') ? null : document
  return isRecord(scene) && isRecord(scene.visualizer) && typeof scene.visualizer.shader === 'string'
    ? JSON.stringify(['custom', scene.visualizer.shader]) : null
}

export function supportedPreviewAudioTargets(
  snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null,
  preview: SceneData | null,
  draft: SceneData,
): AudioResponseTarget[] | null {
  if (!snapshot || !preview) return null
  const identity = scenePlaybackIdentity(preview)
  if (identity === null || identity !== scenePlaybackIdentity(snapshot.sceneBlob)) return null
  const source = sourceIdentity(draft)
  if (source === null || source !== sourceIdentity(preview)) return null
  return snapshot.capabilities.supportedTargets
}
