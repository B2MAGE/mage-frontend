import type { AudioInspectorSnapshot } from '@modules/player'

export type AudioInspectorStore = {
  getSnapshot: () => AudioInspectorSnapshot | null
  subscribe: (listener: () => void) => () => void
  publish: (snapshot: AudioInspectorSnapshot | null) => void
}

/** Keep bounded player samples out of the editor draft and its preview/save updates. */
export function createAudioInspectorStore(): AudioInspectorStore {
  let snapshot: AudioInspectorSnapshot | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(next) {
      if (next === snapshot) return
      snapshot = next
      listeners.forEach(listener => listener())
    },
  }
}
