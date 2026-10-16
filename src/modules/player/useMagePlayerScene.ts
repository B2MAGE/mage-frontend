import { useEffect, useRef, useState, type RefObject } from 'react'
import { createMagePlayer, type MagePlayerController, type MagePlayerPlaybackState, type MageSceneBlob } from './infrastructure/engineAdapter'
import type { MagePlayerAudioResponseCapabilitiesSnapshot } from './MagePlayer'
import { readMagePlayerErrorMessage, type MagePlayerStatus } from './magePlayerUtils'
import { scenePlaybackIdentity, type MageSceneKey } from './scenePlaybackIdentity'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { availabilityTarget } from './availability/availabilityTarget'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import type { RenderProfile } from './policy/renderBudget'
import { isSceneReplacementError } from './isolation/sceneReplacement'
import { validateSceneForPlayback } from './policy/sceneValidation'

export type SessionPlaybackIntent = {
  playback: MagePlayerPlaybackState
  initialPlayback: MagePlayerPlaybackState
  sceneKey: MageSceneKey | undefined
}

type Options = {
  hostRef: RefObject<HTMLDivElement | null>
  sceneBlob: MageSceneBlob | null | undefined
  recoverySceneBlob?: MageSceneBlob
  sceneKey?: MageSceneKey
  renderProfile: RenderProfile
  availabilityPending: boolean
  /** A replacement permission check must not suspend a different authorized scene. */
  activeAvailabilityPending?: boolean
  recoveryRevision: number
  playbackIntentRef: RefObject<SessionPlaybackIntent>
  onReplaceRetiredRenderer(): void
  onCreated(player: MagePlayerController): void
  onReady(player: MagePlayerController, liveUpdate: boolean): void
  onActivated?(scene: MageSceneBlob, sceneKey?: MageSceneKey, recoverySceneBlob?: MageSceneBlob): void
  onError(): void
  onDispose(): void
  onCapabilities?: (snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null) => void
}

type AppliedScene = { player: MagePlayerController; identity: string | null; sceneBlob: MageSceneBlob; recoverySceneBlob?: MageSceneBlob }
type Completion = { version: number; identity: string | null; sceneBlob: MageSceneBlob; error: string | null }

/** Owns one renderer's creation, current scene work, readiness and disposal.
 * The session gates availability/Stop/Retry; audio selection and transport stay separate.
 */
export function useMagePlayerScene(options: Options) {
  const { hostRef, sceneBlob, recoverySceneBlob, sceneKey, renderProfile, availabilityPending,
    recoveryRevision, playbackIntentRef, onReplaceRetiredRenderer } = options
  const callbacks = useRef(options)
  const playerRef = useRef<MagePlayerController | null>(null)
  const latestSceneBlobRef = useRef(sceneBlob)
  const latestSceneKeyRef = useRef(sceneKey)
  const applied = useRef<AppliedScene | null>(null)
  const pending = useRef<{ player: MagePlayerController; sceneBlob: MageSceneBlob } | null>(null)
  const [playerVersion, setPlayerVersion] = useState(0)
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [activePlayer, setActivePlayer] = useState<MagePlayerController | null>(null)
  const activePlayerRef = useRef<MagePlayerController | null>(null)
  const [retryRevision, setRetryRevision] = useState(0)
  const [capabilities, setCapabilities] = useState<{
    player: MagePlayerController; identity: string | null; snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null
  } | null>(null)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)
  const hasScene = Boolean(sceneBlob)

  useEffect(() => {
    callbacks.current = options
    latestSceneBlobRef.current = sceneBlob
    latestSceneKeyRef.current = sceneKey
  })

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const stoppedKey = player.getStoppedRecoveryKey?.()
    if (stoppedKey) {
      const requestedKey = sceneRecoveryKey(recoverySceneBlob ?? sceneBlob, sceneKey)
      if (requestedKey && requestedKey !== stoppedKey && !availabilityPending
        && sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, sceneBlob))
        && !sceneRecovery.isSafeMode() && !sceneRecovery.getBlock(requestedKey)) onReplaceRetiredRenderer()
      return
    }
    player.setRenderingSuspended?.(options.activeAvailabilityPending ?? availabilityPending)
  }, [availabilityPending, options.activeAvailabilityPending, onReplaceRetiredRenderer, playerVersion, recoveryRevision, recoverySceneBlob, sceneBlob, sceneKey])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !latestSceneBlobRef.current) return
    const startup = new AbortController()
    let created: MagePlayerController | null = null
    let disposed = false
    const dispose = () => {
      try { created?.dispose() } catch { /* Keep the host UI usable after a cleanup failure. */ }
    }
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        const initialScene = latestSceneBlobRef.current
        const initialKey = latestSceneKeyRef.current
        const initialRecoveryKey = sceneRecoveryKey(callbacks.current.recoverySceneBlob ?? initialScene, initialKey)
        try {
          created = await createMagePlayer(host, { signal: startup.signal, renderProfile,
            initialSceneBlob: initialScene ?? undefined, mouseInteractions: true, mouseWheelZoom: true,
            initialRecoverySceneBlob: callbacks.current.recoverySceneBlob,
            ...(initialKey === undefined ? {} : { sceneKey: initialKey }) })
          if (disposed) { dispose(); return }
          playerRef.current = created
          setActivePlayer(null)
          activePlayerRef.current = null
          applied.current = null
          pending.current = null
          created.setPlaybackState(playbackIntentRef.current.playback)
          callbacks.current.onCreated(created)
          setPlayerVersion(version => version + 1)
        } catch (error) {
          dispose()
          const current = latestSceneBlobRef.current
          if (!disposed && current) {
            if (initialRecoveryKey !== sceneRecoveryKey(callbacks.current.recoverySceneBlob ?? current, latestSceneKeyRef.current)) {
              callbacks.current.onReplaceRetiredRenderer()
              return
            }
            setCompletion({ version: -1, identity: null, sceneBlob: current, error: readMagePlayerErrorMessage(error) })
            callbacks.current.onError()
          }
        }
      })()
    })
    return () => {
      disposed = true
      startup.abort()
      window.cancelAnimationFrame(frame)
      playerRef.current = null
      pending.current = null
      callbacks.current.onCapabilities?.(null)
      callbacks.current.onDispose()
      dispose()
    }
  }, [hasScene, hostRef, playbackIntentRef, renderProfile])

  useEffect(() => {
    if (availabilityPending && activePlayerRef.current === null) return
    if (!sceneBlob) { applied.current = null; pending.current = null; return }
    const player = playerRef.current
    if (!player || player.getStoppedRecoveryKey?.()) return
    if (pending.current?.player !== player && applied.current?.player === player
      && applied.current.identity === playbackIdentity && applied.current.sceneBlob === sceneBlob
      && applied.current.recoverySceneBlob === recoverySceneBlob) return
    let cancelled = false
    const isCurrent = () => !cancelled && playerRef.current === player && latestSceneBlobRef.current === sceneBlob
    void (async () => {
      try {
        let activated = false
        const onActivated = () => {
          if (playerRef.current !== player) return
          activated = true
          setActivePlayer(player)
          activePlayerRef.current = player
          applied.current = { player, identity: playbackIdentity, sceneBlob, recoverySceneBlob }
          callbacks.current.onActivated?.(sceneBlob, sceneKey, recoverySceneBlob)
        }
        const liveUpdate = pending.current?.player !== player && playbackIdentity !== null
          && applied.current?.player === player && applied.current.identity === playbackIdentity
          && typeof player.updateSceneSettings === 'function'
        if (liveUpdate) {
          player.updateSceneSettings!(sceneBlob, recoverySceneBlob === undefined ? { sceneKey } : { sceneKey, recoverySceneBlob })
          onActivated()
        } else {
          const work = { player, sceneBlob }
          pending.current = work
          try {
            await player.loadSceneBlob(sceneBlob, { sceneKey, onActivated,
              ...(recoverySceneBlob === undefined ? {} : { recoverySceneBlob }) })
            // A completed load also confirms a handoff. The earlier notification
            // is needed when a newer selection overtakes that acknowledgement.
            if (!activated && isCurrent()) {
              validateSceneForPlayback(sceneBlob)
              const key = sceneRecoveryKey(recoverySceneBlob ?? sceneBlob, sceneKey)
              if (!sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, sceneBlob))
                || sceneRecovery.isSafeMode() || (key && sceneRecovery.getBlock(key))) {
                throw new Error('The requested scene cannot currently play.')
              }
              onActivated()
            }
          } finally { if (pending.current === work) pending.current = null }
        }
        if (!isCurrent()) return
        applied.current = { player, identity: playbackIdentity, sceneBlob, recoverySceneBlob }
        queueMicrotask(() => {
          if (!isCurrent()) return
          let snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null = null
          try {
            const available = player.getAudioResponseCapabilities()
            if (available) snapshot = { sceneBlob, capabilities: available }
          } catch { /* Optional inspector information cannot fail playback. */ }
          setCapabilities({ player, identity: playbackIdentity, snapshot })
          playbackIntentRef.current.playback = player.getPlaybackState()
          setCompletion({ version: playerVersion, identity: playbackIdentity, sceneBlob, error: null })
          callbacks.current.onReady(player, liveUpdate)
        })
      } catch (error) {
        queueMicrotask(() => {
          if (!isCurrent()) return
          setCompletion({ version: playerVersion, identity: playbackIdentity, sceneBlob, error: readMagePlayerErrorMessage(error) })
          const retained = isSceneReplacementError(error) ? error.retained
            : activePlayerRef.current === player && !player.getStoppedRecoveryKey?.()
          if (!retained) {
            setActivePlayer(null)
            activePlayerRef.current = null
            callbacks.current.onError()
          }
        })
      }
    })()
    return () => { cancelled = true }
  }, [availabilityPending, playbackIdentity, playerVersion, recoverySceneBlob, playbackIntentRef, sceneBlob, sceneKey, retryRevision])

  const loadError = completion && completion.sceneBlob === sceneBlob ? completion.error : null
  const status: MagePlayerStatus = availabilityPending ? 'loading' : !sceneBlob ? 'empty' : loadError ? 'error'
    : completion?.error === null && completion.version === playerVersion && completion.identity === playbackIdentity
      && (completion.sceneBlob === sceneBlob || (applied.current?.sceneBlob === sceneBlob && pending.current === null)) ? 'ready' : 'loading'
  const hasCapabilitiesCallback = Boolean(options.onCapabilities)
  useEffect(() => {
    if (!hasCapabilitiesCallback) return
    const matches = status === 'ready' && capabilities?.player === playerRef.current && capabilities.identity === playbackIdentity
    // Keep inspector controls mounted while a live settings update reaches the same shader.
    if (status === 'loading' && capabilities?.identity === playbackIdentity
      && applied.current?.sceneBlob === sceneBlob && pending.current === null) return
    if (matches && capabilities.snapshot && capabilities.snapshot.sceneBlob !== sceneBlob) return
    callbacks.current.onCapabilities?.(matches && capabilities.snapshot?.sceneBlob === sceneBlob ? capabilities.snapshot : null)
  }, [capabilities, hasCapabilitiesCallback, playbackIdentity, playerVersion, sceneBlob, status])

  return { playerRef, latestSceneBlobRef, playerVersion, playbackIdentity, status, loadError,
    retryScene: () => { setCompletion(null); setRetryRevision(value => value + 1) },
    hasLoadedScene: activePlayer !== null && activePlayer === playerRef.current && !activePlayer.getStoppedRecoveryKey?.() }
}
