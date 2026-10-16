import type { AudioResponseTarget } from '@notrac/mage/audio-response'
import type { AudioSpectrumSnapshot } from '@notrac/mage/audio-analysis'
import type { SceneAudioResponseMode } from '@shared/lib/audioResponse'
import type { BuilderBinding } from './templates/sceneContract'

export const AUDIO_INSPECTOR_BANDS = ['bass', 'mid', 'treble', 'overall'] as const
/** Longer than the 250 ms UI poll so an attack survives ordinary bridge scheduling. */
export const AUDIO_INSPECTOR_HIT_SECONDS = 0.4
export type AudioInspectorBands = Record<typeof AUDIO_INSPECTOR_BANDS[number], number>
export type AudioInspectorSpectrum = AudioSpectrumSnapshot
export type AudioInspectorBinding = {
  objectId: string
  target: BuilderBinding['target']
  source: BuilderBinding['source']
  signal: number
  /** The actual response uniform, before shader Animation influences. */
  value: number
}
export type AudioInspectorSnapshot = {
  mode: SceneAudioResponseMode
  source: 'audio' | 'synthetic' | 'none'
  playing: boolean
  audioLoaded: boolean
  /** Null means no current band measurement, never a made-up silent sample. */
  levels: AudioInspectorBands | null
  hits: AudioInspectorBands
  sceneOutputs: Partial<Record<AudioResponseTarget, number>>
  bindings: AudioInspectorBinding[]
  driverSignals: { source: BuilderBinding['source']; value: number }[]
  /** Optional parent-only audio data; never sent through the isolated renderer. */
  spectrum?: AudioInspectorSpectrum | null
}

export const emptyInspectorBands = (): AudioInspectorBands => ({ bass: 0, mid: 0, treble: 0, overall: 0 })
