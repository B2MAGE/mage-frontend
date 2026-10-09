// Share the lightweight contract with the patched engine without loading WebGL.
export { normalizeAudioResponseConfig } from '@notrac/mage/audio-response'
export type SceneAudioResponseMode = 'legacy' | 'mapped-v1'

/** The Original response remains the default for current documents. */
export function normalizeAudioResponseMode(value: unknown): SceneAudioResponseMode {
  if (value === undefined || value === 'legacy') return 'legacy'
  if (value === 'mapped-v1') return 'mapped-v1'
  throw new Error('Unsupported music response version.')
}
export type {
  AudioResponseConfig,
  AudioResponseMapping,
  AudioResponseSignal,
  AudioResponseTarget,
} from '@notrac/mage/audio-response'
