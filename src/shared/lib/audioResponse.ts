export type SceneAudioResponseMode = 'legacy' | 'transient-v1'

// Missing or unsupported modes must never opt an existing scene into a new response.
export function normalizeAudioResponseMode(value: unknown): SceneAudioResponseMode {
  return value === 'transient-v1' ? 'transient-v1' : 'legacy'
}
