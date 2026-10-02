import { vi } from 'vitest'
import type { MageAudioResponseState, MagePlayerController } from '@modules/player'

export function buildAudioResponseController(): Pick<MagePlayerController,
  'getAudioResponseState' | 'getAudioResponseCapabilities' | 'getAudioResponseDiagnostics'
  | 'getAudioResponseEvents' | 'setAudioResponseSettings' | 'setAudioResponseOverride'> {
  const state = (): MageAudioResponseState => ({
    savedMode: 'legacy', savedConfig: null, override: null,
    effectiveMode: 'legacy', effectiveConfig: null,
  })
  return {
    getAudioResponseState: vi.fn(state),
    getAudioResponseCapabilities: vi.fn(() => null),
    getAudioResponseDiagnostics: vi.fn(() => null),
    getAudioResponseEvents: vi.fn(() => []),
    setAudioResponseSettings: vi.fn(state),
    setAudioResponseOverride: vi.fn(state),
  }
}
