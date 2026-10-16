import { useEffect, type RefObject } from 'react'
import type { AudioInspectorSnapshot } from './audioInspector'
import type { MagePlayerController, MageSceneBlob } from './infrastructure/playerController'

/** Optional, read-only observation; never participates in scene loading or playback health. */
export function useAudioInspector({ playerRef, playerVersion, ready, sceneBlob, onChange }: {
  playerRef: RefObject<MagePlayerController | null>
  playerVersion: number
  ready: boolean
  sceneBlob: MageSceneBlob | null | undefined
  onChange?: (snapshot: AudioInspectorSnapshot | null) => void
}) {
  useEffect(() => {
    if (!onChange) return
    onChange(null)
    const player = playerRef.current
    if (!ready || !player?.requestAudioInspector) return

    let disposed = false
    let pending = false
    let generation = 0
    const setEnabled = (enabled: boolean) => {
      try { player.setAudioInspectorEnabled?.(enabled) }
      catch { /* Optional spectrum resources cannot interrupt playback. */ }
    }
    const publish = async () => {
      if (disposed || pending || document.hidden || playerRef.current !== player) return
      const requestGeneration = generation
      pending = true
      let snapshot: AudioInspectorSnapshot | null = null
      try { snapshot = await player.requestAudioInspector!() }
      catch { /* Missing diagnostics must never interrupt the preview. */ }
      finally { pending = false }
      if (!disposed && requestGeneration === generation && !document.hidden && playerRef.current === player) onChange(snapshot)
    }
    const onVisibilityChange = () => {
      generation++
      setEnabled(!document.hidden)
      onChange(null)
      if (!document.hidden) void publish()
    }
    setEnabled(!document.hidden)
    void publish()
    const timer = window.setInterval(() => { void publish() }, 250)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      setEnabled(false)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      onChange(null)
    }
  }, [onChange, playerRef, playerVersion, ready, sceneBlob])
}
