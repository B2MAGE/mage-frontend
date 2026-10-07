import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { MagePlayerLoading } from './MagePlayerLoading'
import {
  createMagePlayer,
  type MageAudioResponseCapabilities,
  type MageEngineDiagnostics,
  type MagePlayerAudioState,
  type MagePlayerController,
  type MagePlayerPlaybackState,
  type MageSceneBlob,
} from './infrastructure/engineAdapter'
import { type MagePlayerPlaylistTrack } from './playlist'
import { MagePlayerControls, MagePlayerDisabledControls } from './MagePlayerControls'
import './magePlayer.css'
import './pulsePlayer.css'
import {
  audioStatesMatch,
  buildMagePlayerClassName,
  EMPTY_AUDIO_STATE,
  readMagePlayerErrorMessage,
  type MagePlayerStatus,
} from './magePlayerUtils'
import { useMagePlayerPlaylist } from './useMagePlayerPlaylist'
import { useMagePlayerAudioSelection } from './useMagePlayerAudioSelection'
import { scenePlaybackIdentity, type MageSceneKey } from './scenePlaybackIdentity'
import { extractLiveSceneSettings } from './liveSceneSettings'
import { normalizeAudioResponseMode } from '@shared/lib'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { SceneRecoveryPanel } from './recovery/SceneRecoveryPanel'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { availabilityStatusTarget, availabilityTarget } from './availability/availabilityTarget'
import { useSceneAvailability } from './availability/useSceneAvailability'
import { SceneAvailabilityPanel } from './availability/SceneAvailabilityPanel'
import { validateSceneForPlayback } from './policy/sceneValidation'
import { boundCaptureSize, type RenderProfile } from './policy/renderBudget'
import { resolveSceneForPlayback } from './templates/resolveScene'

export type MagePlayerAudioResponseCapabilitiesSnapshot = {
  sceneBlob: MageSceneBlob
  capabilities: MageAudioResponseCapabilities
}

export type MagePlayerPlaybackStatus = 'playing' | 'paused' | 'unavailable'

export type MagePlayerProps = {
  /** Players without a playlist replace their only song after it loads. */
  audioMode?: 'single' | 'playlist'
  ariaLabel?: string
  className?: string
  initialPlayback?: MagePlayerPlaybackState
  log?: boolean
  renderProfile?: RenderProfile
  onAudioResponseCapabilitiesChange?: (snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null) => void
  onEngineDiagnosticsChange?: (diagnostics: MageEngineDiagnostics | null) => void
  onCaptureFramePreviewChange?: (
    captureFramePreview: (() => Promise<string | null>) | null,
  ) => void
  onPlaylistChange?: (tracks: MagePlayerPlaylistTrack[]) => void
  onPlaybackStatusChange?: (status: MagePlayerPlaybackStatus) => void
  /** Notify a route-owned playlist to reset its local ordering/preferences. */
  onClearMusic?: () => void
  onRequestPlaylistOpen?: () => void
  onSelectedTrackChange?: (trackId: string | null) => void
  onTrackDurationChange?: (trackId: string, duration: number) => void
  onAvailabilityRestored?: () => void | Promise<void>
  playlistTracks?: MagePlayerPlaylistTrack[]
  posterUrl?: string | null
  repeatEnabled?: boolean
  sceneBlob: MageSceneBlob | null | undefined
  /** Original document before editor defaults, for consistent recovery across routes. */
  recoverySceneBlob?: MageSceneBlob
  sceneKey?: MageSceneKey
  selectedTrackId?: string | null
  shuffleEnabled?: boolean
  simulatedBeat?: { enabled: boolean; bpm: number }
}

function blurMouseActivatedControl(control: HTMLButtonElement, clickCount: number) {
  if (clickCount <= 0) {
    return
  }

  window.requestAnimationFrame(() => {
    if (control.isConnected) {
      control.blur()
    }
  })
}

/** Keep recovery controls and editor state outside the renderer's lifetime. */
export function MagePlayer(props: MagePlayerProps) {
  const audioInputRef = useRef<HTMLInputElement>(null)
  const rendererAudioClearRef = useRef<(() => void) | null>(null)
  const playlist = useMagePlayerPlaylist(props)
  const audioSelection = useMagePlayerAudioSelection({
    inputRef: audioInputRef,
    playlist,
    sceneIdentity: scenePlaybackIdentity(props.sceneBlob, props.sceneKey),
    audioMode: props.audioMode,
    onRequestPlaylistOpen: props.onRequestPlaylistOpen,
  })
  function clearMusic() {
    audioSelection.clear()
    // Retire the current transport before publishing an empty queue, so the
    // normal remove-last-track effect cannot change scene play/pause intent.
    rendererAudioClearRef.current?.()
    playlist.clear()
    props.onClearMusic?.()
  }
  return <>
    <input accept="audio/*" className="mage-player__audio-input" hidden multiple={props.audioMode !== 'single'}
      onChange={event => { void audioSelection.select(event) }} ref={audioInputRef} type="file" />
    <MagePlayerSession {...props} playlist={playlist} audioSelection={audioSelection}
      clearMusic={clearMusic} rendererAudioClearRef={rendererAudioClearRef} />
  </>
}

type SessionAudioProps = {
  playlist: ReturnType<typeof useMagePlayerPlaylist>
  audioSelection: ReturnType<typeof useMagePlayerAudioSelection>
  clearMusic: () => void
  rendererAudioClearRef: { current: (() => void) | null }
}

type SessionPlaybackIntent = { playback: MagePlayerPlaybackState; initialPlayback: MagePlayerPlaybackState; sceneKey: MageSceneKey | undefined }

function MagePlayerStatusReporter({
  onChange,
  status,
}: {
  onChange?: (status: MagePlayerPlaybackStatus) => void
  status: MagePlayerPlaybackStatus
}) {
  useEffect(() => onChange?.(status), [onChange, status])
  return null
}

function MagePlayerSession(props: MagePlayerProps & SessionAudioProps) {
  const defaultPlayback = props.initialPlayback ?? 'playing'
  const playbackIntentRef = useRef<SessionPlaybackIntent>({ playback: defaultPlayback, initialPlayback: defaultPlayback, sceneKey: props.sceneKey })
  const validationError = useMemo(() => {
    if (!props.sceneBlob) return null
    try { validateSceneForPlayback(props.sceneBlob); return null }
    catch (error) { return readMagePlayerErrorMessage(error) }
  }, [props.sceneBlob])
  const recoveryRevision = useSyncExternalStore(sceneRecovery.subscribe, sceneRecovery.getSnapshot, sceneRecovery.getSnapshot)
  const [rendererInstance, setRendererInstance] = useState(0)
  const replaceRetiredRenderer = useCallback(() => setRendererInstance(value => value + 1), [])
  const { playlist, audioSelection } = props
  const recoveryKey = useMemo(() => sceneRecoveryKey(props.recoverySceneBlob ?? props.sceneBlob, props.sceneKey), [props.recoverySceneBlob, props.sceneBlob, props.sceneKey])
  const structuralIdentity = scenePlaybackIdentity(props.sceneBlob, props.sceneKey)
  const [previousRecovery, setPreviousRecovery] = useState({ identity: structuralIdentity, key: recoveryKey })
  // Editing live controls must not restart a stopped or failed scene. A stop
  // during a retry can retain its original failure reason, so preserve any block
  // until an explicit Resume/Retry while the editable draft continues to update.
  const retainedBlock = structuralIdentity !== null && previousRecovery.identity === structuralIdentity
    && previousRecovery.key && sceneRecovery.getBlock(previousRecovery.key)
    ? previousRecovery.key : null
  const blockedRecoveryKey = retainedBlock ?? recoveryKey
  // An invalid intermediate draft is not a new renderable scene. Keep the last
  // blocked identity so correcting a numeric field cannot implicitly resume it.
  if (structuralIdentity !== null
    && (previousRecovery.identity !== structuralIdentity || previousRecovery.key !== blockedRecoveryKey)) {
    setPreviousRecovery({ identity: structuralIdentity, key: blockedRecoveryKey })
  }
  const block = blockedRecoveryKey ? sceneRecovery.getBlock(blockedRecoveryKey) : null
  const safeMode = sceneRecovery.isSafeMode()
  const target = useMemo(() => props.sceneBlob ? availabilityTarget(props.sceneKey, props.sceneBlob)
    : availabilityStatusTarget(props.sceneKey), [props.sceneKey, props.sceneBlob])
  const availability = useSceneAvailability(target)
  const sourceIdentity = useMemo(() => `${target}:${sceneRecoveryKey(props.sceneBlob, props.sceneKey)}:${recoveryKey}`,
    [props.sceneBlob, props.sceneKey, recoveryKey, target])
  const [retainedSource, setRetainedSource] = useState<string | null>(null)
  const onRendererReady = useCallback(() => setRetainedSource(sourceIdentity), [sourceIdentity])
  // Keep the parent session while checking a replacement scene. Its renderer is
  // paused until permission is confirmed; a denial still ends the entire session.
  if (retainedSource !== null && !availability.allowed && availability.code !== 'CHECKING') setRetainedSource(null)
  const availabilityPending = availability.code === 'CHECKING' && retainedSource !== null
  const retainsSession = availability.allowed || availabilityPending
  const requiresAvailability = !!props.sceneBlob || target !== 'custom'
  const [reloadAttempt, setReloadAttempt] = useState(0)
  const [sourceError, setSourceError] = useState(false)
  const restoreSourceRef = useRef(props.onAvailabilityRestored)
  useEffect(() => { restoreSourceRef.current = props.onAvailabilityRestored }, [props.onAvailabilityRestored])
  const hasSource = !!props.sceneBlob
  const canRestoreSource = !!props.onAvailabilityRestored

  useEffect(() => {
    if (!availability.allowed && availability.code !== 'CHECKING' && recoveryKey) sceneRecovery.revokeRetry(recoveryKey)
  }, [availability.allowed, availability.code, recoveryKey])

  useEffect(() => {
    if (!availability.allowed || hasSource || target === 'custom' || !canRestoreSource) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled || !sceneAvailabilityStore.isAllowed(target)) return
      setSourceError(false)
      return restoreSourceRef.current?.()
    }).catch(() => {
      if (!cancelled) setSourceError(true)
    })
    return () => { cancelled = true }
  }, [availability.allowed, canRestoreSource, hasSource, reloadAttempt, target])

  // A global pause replaces the renderer, but keeps this viewing session open.
  // Navigating away or editing the revision ends any retained retry permission.
  useEffect(() => {
    if (!recoveryKey || !retainsSession) return
    const release = sceneRecovery.retainPlaybackSession(recoveryKey)
    return () => {
      // Cleanup runs before the new effect. Revoke first so a server stop cannot
      // retire a remembered interruption through a suspended local retry.
      const status = sceneAvailabilityStore.getSnapshot(target)
      if (!status.allowed && status.code !== 'CHECKING') sceneRecovery.revokeRetry(recoveryKey)
      release()
    }
  }, [retainsSession, recoveryKey, target])

  useEffect(() => {
    // A cached browser page retains React state, but pagehide has shut down its
    // graphics resources. Recreate only the renderer, keeping the editor/playlist.
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted) setRendererInstance((instance) => instance + 1)
    }
    window.addEventListener('pageshow', restorePage)
    return () => window.removeEventListener('pageshow', restorePage)
  }, [])

  if (requiresAvailability && ((!availability.allowed && !availabilityPending) || !props.sceneBlob)) {
    const checking = availability.code === 'CHECKING' || (availability.allowed && canRestoreSource && !sourceError)
    return <>
      <MagePlayerStatusReporter onChange={props.onPlaybackStatusChange} status={checking ? 'paused' : 'unavailable'} />
      <SceneAvailabilityPanel className={props.className} posterUrl={props.posterUrl}
        audioMode={props.audioMode}
        message={!availability.allowed ? availability.message : sourceError
          ? 'This scene could not be loaded. You can check again.' : canRestoreSource
            ? 'Loading this scene…' : 'This scene is temporarily unavailable.'}
        checking={checking}
        onCheck={availability.code === 'STATUS_UNAVAILABLE' ? () => { void sceneAvailabilityStore.check(target) }
          : availability.allowed && sourceError ? () => setReloadAttempt((value) => value + 1) : undefined}
      />
    </>
  }

  if (props.sceneBlob && (block || safeMode)) {
    return <>
      <MagePlayerStatusReporter
        onChange={props.onPlaybackStatusChange}
        status={safeMode || block?.reason === 'stopped' ? 'paused' : 'unavailable'}
      />
      <SceneRecoveryPanel
        audioMode={props.audioMode}
        className={props.className}
        posterUrl={props.posterUrl}
        block={block}
        safeMode={safeMode}
        onRetry={() => {
          if (!blockedRecoveryKey || !sceneAvailabilityStore.isAllowed(target)) return
          if (block?.reason === 'stopped') sceneRecovery.resumeStoppedScene(blockedRecoveryKey, block.at)
          else sceneRecovery.retry(blockedRecoveryKey)
        }}
        onSafeModeChange={sceneRecovery.setSafeMode}
      />
    </>
  }

  if (validationError) {
    return <>
      <MagePlayerStatusReporter onChange={props.onPlaybackStatusChange} status="unavailable" />
      <section className={buildMagePlayerClassName('mage-player', props.className)} data-state="error">
        <div className="mage-player__viewport">
          <div className="mage-player__overlay" role="alert">
            <div className="mage-player__overlay-copy"><strong>This scene needs changes.</strong><p>{validationError}</p></div>
          </div>
        </div>
        <MagePlayerDisabledControls audioMode={props.audioMode} />
      </section>
    </>
  }

  return <MagePlayerRenderer key={rendererInstance} {...props}
    playbackIntentRef={playbackIntentRef}
    availabilityPending={availabilityPending}
    onRendererReady={onRendererReady}
    onReplaceRetiredRenderer={replaceRetiredRenderer}
    recoveryRevision={recoveryRevision}
    playlist={playlist}
    audioSelection={audioSelection}
    onStopRendering={recoveryKey ? () => sceneRecovery.block(recoveryKey, 'stopped') : undefined}
    onSafeMode={() => sceneRecovery.setSafeMode(true)}
  />
}

function MagePlayerRenderer({
  audioMode = 'playlist',
  ariaLabel = 'MAGE scene preview',
  className,
  initialPlayback = 'playing',
  log = false,
  renderProfile = 'full',
  onAudioResponseCapabilitiesChange,
  onEngineDiagnosticsChange,
  onCaptureFramePreviewChange,
  onPlaybackStatusChange,
  onRequestPlaylistOpen,
  repeatEnabled = false,
  sceneBlob,
  recoverySceneBlob,
  sceneKey,
  shuffleEnabled = false,
  simulatedBeat,
  onStopRendering,
  onSafeMode,
  playlist,
  audioSelection,
  clearMusic,
  rendererAudioClearRef,
  availabilityPending,
  onRendererReady,
  playbackIntentRef,
  onReplaceRetiredRenderer,
  recoveryRevision,
}: MagePlayerProps & { onStopRendering?: () => void; onSafeMode: () => void; availabilityPending: boolean; onRendererReady: () => void;
  playbackIntentRef: { current: SessionPlaybackIntent }; onReplaceRetiredRenderer: () => void; recoveryRevision: number } & SessionAudioProps) {
  const renderHostRef = useRef<HTMLDivElement | null>(null)
  const volumeControlRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<MagePlayerController | null>(null)
  const capabilitiesCallbackRef = useRef(onAudioResponseCapabilitiesChange)
  const diagnosticsCallbackRef = useRef(onEngineDiagnosticsChange)
  const latestSceneBlobRef = useRef<MageSceneBlob | null | undefined>(sceneBlob)
  const latestSceneKeyRef = useRef(sceneKey)
  // The viewing session owns user intent even when pause-all, recovery or a
  // cached-page return replaces this renderer and its audio resources.
  const requestedPlaybackRef = playbackIntentRef
  const loadedTrackIdRef = useRef<string | null>(null)
  const completedTrackIdRef = useRef<string | null>(null)
  const hasConfiguredSimulatedBeatRef = useRef(false)
  const appliedSceneRef = useRef<{ player: MagePlayerController; identity: string | null; sceneBlob: MageSceneBlob; recoverySceneBlob?: MageSceneBlob } | null>(null)
  const pendingSceneLoadRef = useRef<{ player: MagePlayerController; sceneBlob: MageSceneBlob } | null>(null)
  const pendingAudioRef = useRef<{ player: MagePlayerController; trackId: string; result: Promise<MagePlayerAudioState> } | null>(null)
  const audioGenerationRef = useRef(0)
  const playlistLoadAbortRef = useRef<AbortController | null>(null)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)
  const hasScene = Boolean(sceneBlob)

  const {
    commitSelectedTrackId,
    commitTrackDuration,
    currentTrack,
    currentTrackIndex,
    tracks,
  } = playlist

  const [loadedSceneIdentity, setLoadedSceneIdentity] = useState<string | null>(null)
  const [loadedPlayerVersion, setLoadedPlayerVersion] = useState<number | null>(null)
  const [playerVersion, setPlayerVersion] = useState(0)
  const [playbackState, setPlaybackState] = useState<MagePlayerPlaybackState>(initialPlayback)
  const [audioState, setAudioState] = useState<MagePlayerAudioState>(EMPTY_AUDIO_STATE)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [activeAudioAction, setActiveAudioAction] = useState<'add' | 'load' | null>(null)
  const [isVolumeOpen, setIsVolumeOpen] = useState(false)
  const [trackLoadVersion, setTrackLoadVersion] = useState(0)
  const [loadError, setLoadError] = useState<{ message: string; sceneBlob: MageSceneBlob } | null>(
    null,
  )
  const [capabilitiesResult, setCapabilitiesResult] = useState<{
    player: MagePlayerController
    identity: string | null
    snapshot: MagePlayerAudioResponseCapabilitiesSnapshot | null
  } | null>(null)

  const { candidate: audioCandidate, accept: acceptAudioCandidate, reject: rejectAudioCandidate, cancelPending: cancelAudioSelection } = audioSelection
  // A stopped/disposed renderer cannot finish a file selection after Resume.
  // Permission rechecks retain this renderer and do not cancel the selection.
  useEffect(() => () => cancelAudioSelection(), [cancelAudioSelection])

  const invalidateAudioLoads = useCallback(() => {
    audioGenerationRef.current++
    playlistLoadAbortRef.current?.abort()
    playlistLoadAbortRef.current = null
    pendingAudioRef.current = null
  }, [])

  const clearRenderedMusic = useCallback(() => {
    invalidateAudioLoads()
    loadedTrackIdRef.current = null
    completedTrackIdRef.current = null
    setActiveAudioAction(null)
    setIsVolumeOpen(false)
    setAudioError(null)
    try {
      const player = playerRef.current
      setAudioState(player ? player.clearAudio() : EMPTY_AUDIO_STATE)
    } catch (error) {
      setAudioState(EMPTY_AUDIO_STATE)
      setAudioError(readMagePlayerErrorMessage(error))
    }
  }, [invalidateAudioLoads])

  useEffect(() => {
    rendererAudioClearRef.current = clearRenderedMusic
    return () => {
      if (rendererAudioClearRef.current === clearRenderedMusic) rendererAudioClearRef.current = null
      invalidateAudioLoads()
    }
  }, [clearRenderedMusic, invalidateAudioLoads, rendererAudioClearRef])

  useEffect(() => {
    capabilitiesCallbackRef.current = onAudioResponseCapabilitiesChange
  }, [onAudioResponseCapabilitiesChange])

  useEffect(() => {
    diagnosticsCallbackRef.current = onEngineDiagnosticsChange
  }, [onEngineDiagnosticsChange])

  useEffect(() => {
    latestSceneBlobRef.current = sceneBlob
    latestSceneKeyRef.current = sceneKey
  }, [sceneBlob, sceneKey])

  useEffect(() => {
    if (sceneBlob) {
      return
    }

    setAudioState(EMPTY_AUDIO_STATE)
    setAudioError(null)
    setActiveAudioAction(null)
    setIsVolumeOpen(false)
  }, [sceneBlob])

  useEffect(() => {
    if (requestedPlaybackRef.current.initialPlayback !== initialPlayback || requestedPlaybackRef.current.sceneKey !== sceneKey) {
      requestedPlaybackRef.current = { playback: initialPlayback, initialPlayback, sceneKey }
    }
    const requested = requestedPlaybackRef.current.playback
    setPlaybackState(requested)

    const player = playerRef.current

    if (!player || player.getStoppedRecoveryKey?.() || (requested === 'playing'
      && !sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, latestSceneBlobRef.current)))) {
      return
    }

    setPlaybackState(player.setPlaybackState(requested))
    setAudioState(player.getAudioState())
  }, [initialPlayback, requestedPlaybackRef, sceneKey])

  useEffect(() => {
    // The retained controller may still watch the previous scene's permission
    // while the replacement is being checked. Suspend only its visual output.
    const player = playerRef.current
    if (!player) return
    const stoppedKey = player.getStoppedRecoveryKey?.()
    if (stoppedKey) {
      const requestedKey = sceneRecoveryKey(recoverySceneBlob ?? sceneBlob, sceneKey)
      // An older in-flight scene can fail after selection moves elsewhere.
      // Replace that retired renderer only for a separately allowed revision;
      // the failed revision's recovery record still requires deliberate Retry.
      if (requestedKey && requestedKey !== stoppedKey && !availabilityPending
        && sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, sceneBlob))
        && !sceneRecovery.isSafeMode() && !sceneRecovery.getBlock(requestedKey)) onReplaceRetiredRenderer()
      return
    }
    player.setRenderingSuspended?.(availabilityPending)
  }, [availabilityPending, onReplaceRetiredRenderer, playerVersion, recoveryRevision, recoverySceneBlob, sceneBlob, sceneKey])

  useEffect(() => {
    const canvas = renderHostRef.current

    if (!canvas || !latestSceneBlobRef.current) {
      return
    }

    let nextPlayer: MagePlayerController | null = null
    let isDisposed = false
    let animationFrameId = 0
    const startup = new AbortController()
    const disposePlayer = () => {
      try { nextPlayer?.dispose() } catch {
        // The adapter retains its marker when cleanup fails. Recovery controls
        // and unsaved editor state must survive that failure too.
      }
    }

    animationFrameId = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          const initialSceneKey = latestSceneKeyRef.current
          nextPlayer = await createMagePlayer(canvas, { signal: startup.signal, log, renderProfile, initialSceneBlob: latestSceneBlobRef.current ?? undefined, mouseInteractions: true, mouseWheelZoom: true, ...(initialSceneKey === undefined ? {} : { sceneKey: initialSceneKey }) })

          if (isDisposed) {
            disposePlayer()
            return
          }

          playerRef.current = nextPlayer
          appliedSceneRef.current = null
          pendingSceneLoadRef.current = null
          loadedTrackIdRef.current = null
          completedTrackIdRef.current = null
          pendingAudioRef.current = null
          setPlaybackState(nextPlayer.setPlaybackState(requestedPlaybackRef.current.playback))
          setAudioState(nextPlayer.getAudioState())
          setPlayerVersion((currentVersion) => currentVersion + 1)
        } catch (error) {
          disposePlayer()

          if (!isDisposed) {
            const currentSceneBlob = latestSceneBlobRef.current

            if (currentSceneBlob) {
              setLoadError({
                message: readMagePlayerErrorMessage(error),
                sceneBlob: currentSceneBlob,
              })
            }
          }
        }
      })()
    })

    return () => {
      isDisposed = true
      startup.abort()
      window.cancelAnimationFrame(animationFrameId)
      playerRef.current = null
      pendingSceneLoadRef.current = null
      capabilitiesCallbackRef.current?.(null)
      diagnosticsCallbackRef.current?.(null)
      disposePlayer()
    }
  }, [hasScene, log, renderProfile, requestedPlaybackRef])

  useEffect(() => {
    if (availabilityPending) return
    if (!sceneBlob) {
      appliedSceneRef.current = null
      pendingSceneLoadRef.current = null
      loadedTrackIdRef.current = null
      completedTrackIdRef.current = null
      return
    }

    const player = playerRef.current

    if (!player || player.getStoppedRecoveryKey?.()) {
      return
    }
    if (pendingSceneLoadRef.current?.player !== player
      && appliedSceneRef.current?.player === player && appliedSceneRef.current.identity === playbackIdentity && appliedSceneRef.current.sceneBlob === sceneBlob
      && appliedSceneRef.current.recoverySceneBlob === recoverySceneBlob) return

    let isCancelled = false

    void (async () => {
      try {
        const sameStructure = playbackIdentity !== null
          && appliedSceneRef.current?.player === player
          && appliedSceneRef.current.identity === playbackIdentity
        // Older artwork-only adapters retain the response API. They may reuse a
        // scene only for response edits, never silently ignore another setting.
        const isLiveUpdate = pendingSceneLoadRef.current?.player !== player && sameStructure && (typeof player.updateSceneSettings === 'function'
          || JSON.stringify(extractLiveSceneSettings(appliedSceneRef.current!.sceneBlob))
            === JSON.stringify(extractLiveSceneSettings(sceneBlob)))
        if (isLiveUpdate && player.updateSceneSettings) {
          player.updateSceneSettings(sceneBlob, recoverySceneBlob === undefined ? { sceneKey } : { sceneKey, recoverySceneBlob })
        } else if (isLiveUpdate) {
          const validated = validateSceneForPlayback(sceneBlob)
          const response = resolveSceneForPlayback(validated).engineScene
          player.setAudioResponseSettings(
            Object.hasOwn(response, 'audioResponse') ? normalizeAudioResponseMode(response.audioResponse) : undefined,
            response.audioResponseConfig,
          )
          player.updateRecoveryIdentity?.(sceneBlob, recoverySceneBlob === undefined ? { sceneKey } : { sceneKey, recoverySceneBlob })
        } else {
          const pendingSceneLoad = { player, sceneBlob }
          pendingSceneLoadRef.current = pendingSceneLoad
          try {
            if (recoverySceneBlob !== undefined) await player.loadSceneBlob(sceneBlob, { sceneKey, recoverySceneBlob })
            else if (sceneKey === undefined) await player.loadSceneBlob(sceneBlob)
            else await player.loadSceneBlob(sceneBlob, { sceneKey })
          } finally {
            if (pendingSceneLoadRef.current === pendingSceneLoad) pendingSceneLoadRef.current = null
          }
        }
        if (isCancelled || playerRef.current !== player || latestSceneBlobRef.current !== sceneBlob) return
        appliedSceneRef.current = { player, identity: playbackIdentity, sceneBlob, recoverySceneBlob }
        const nextPlaybackState = player.getPlaybackState()

        queueMicrotask(() => {
          if (isCancelled || playerRef.current !== player || latestSceneBlobRef.current !== sceneBlob) {
            return
          }

          // Read capabilities only after this exact document has reached this
          // player. A missing older-engine API must not make playback fail.
          let capabilities: MageAudioResponseCapabilities | null = null
          try {
            capabilities = player.getAudioResponseCapabilities?.() ?? null
          } catch {
            capabilities = null
          }
          setCapabilitiesResult({
            player,
            identity: playbackIdentity,
            snapshot: capabilities ? { sceneBlob, capabilities } : null,
          })
          requestedPlaybackRef.current.playback = nextPlaybackState
          setLoadError(null)
          setLoadedSceneIdentity(playbackIdentity)
          setLoadedPlayerVersion(playerVersion)
          setPlaybackState(nextPlaybackState)
          setAudioState(player.getAudioState())
          onRendererReady()
          if (!isLiveUpdate) {
            setAudioError(null)
            setActiveAudioAction(null)
          }
        })
      } catch (error) {
        queueMicrotask(() => {
          if (isCancelled || playerRef.current !== player || latestSceneBlobRef.current !== sceneBlob) {
            return
          }

          setAudioState(EMPTY_AUDIO_STATE)
          setLoadError({
            message: readMagePlayerErrorMessage(error),
            sceneBlob,
          })
        })
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [availabilityPending, onRendererReady, playbackIdentity, playerVersion, recoverySceneBlob, requestedPlaybackRef, sceneBlob, sceneKey])

  const status: MagePlayerStatus =
    availabilityPending
      ? 'loading'
      : !sceneBlob
      ? 'empty'
      : loadError?.sceneBlob === sceneBlob
        ? 'error'
        : playbackIdentity !== null && loadedSceneIdentity === playbackIdentity && loadedPlayerVersion === playerVersion
          ? 'ready'
          : 'loading'

  const publishedPlaybackStatus: MagePlayerPlaybackStatus = status === 'ready'
    ? playbackState
    : status === 'loading'
      ? 'paused'
      : 'unavailable'

  useEffect(() => {
    onPlaybackStatusChange?.(publishedPlaybackStatus)
  }, [onPlaybackStatusChange, publishedPlaybackStatus])

  const hasCapabilitiesCallback = Boolean(onAudioResponseCapabilitiesChange)

  useEffect(() => {
    if (!hasCapabilitiesCallback) return
    const matchesCompiledPlayer = status === 'ready'
      && capabilitiesResult?.player === playerRef.current
      && capabilitiesResult?.identity === playbackIdentity
    // Live edits keep the same compiled shader. Retain its published
    // capabilities until the exact updated document is ready, so editor
    // controls do not unmount during a slider drag or keyboard adjustment.
    if (matchesCompiledPlayer && capabilitiesResult.snapshot
      && capabilitiesResult.snapshot.sceneBlob !== sceneBlob) return
    const matchesLoadedScene = matchesCompiledPlayer
      && capabilitiesResult.snapshot?.sceneBlob === sceneBlob
    capabilitiesCallbackRef.current?.(matchesLoadedScene ? capabilitiesResult.snapshot : null)
  }, [capabilitiesResult, hasCapabilitiesCallback, playbackIdentity, playerVersion, sceneBlob, status])

  const hasDiagnosticsCallback = Boolean(onEngineDiagnosticsChange)

  useEffect(() => {
    if (!hasDiagnosticsCallback) return
    const player = playerRef.current
    if (!player || status !== 'ready') {
      diagnosticsCallbackRef.current?.(null)
      return
    }

    let previous: MageEngineDiagnostics | null | undefined
    function publishMeasurements() {
      if (playerRef.current !== player) return
      let next: MageEngineDiagnostics | null = null
      try {
        next = player?.getEngineDiagnostics?.() ?? null
      } catch {
        next = null
      }
      if (previous !== undefined && (previous === next || previous && next
        && previous.size === next.size && previous.pointerDown === next.pointerDown
        && previous.currPointerDown === next.currPointerDown && previous.currAudio === next.currAudio)) return
      previous = next
      diagnosticsCallbackRef.current?.(next)
    }

    publishMeasurements()
    // Consumers opt in by supplying a callback. Keep live readings off the
    // animation frame path and skip unchanged values.
    const intervalId = window.setInterval(publishMeasurements, 250)
    return () => {
      window.clearInterval(intervalId)
      diagnosticsCallbackRef.current?.(null)
    }
  }, [hasDiagnosticsCallback, playbackIdentity, playerVersion, status])

  const hasSimulatedBeat = simulatedBeat !== undefined
  const simulatedBeatEnabled = simulatedBeat?.enabled ?? false
  const requestedBeatBpm = simulatedBeat?.bpm ?? 120
  const simulatedBeatBpm = Number.isFinite(requestedBeatBpm)
    ? Math.min(180, Math.max(60, requestedBeatBpm))
    : 120

  useEffect(() => {
    const player = playerRef.current

    if (!player || status !== 'ready') {
      return
    }

    // Ordinary scene players never opt into editor-only preview audio. Disable
    // an earlier preview if the prop is removed from this mounted player.
    if (!hasSimulatedBeat && !hasConfiguredSimulatedBeatRef.current) {
      return
    }

    // Seed 24 has a base tempo of 120 BPM. Actual playing audio automatically
    // takes priority inside the engine, without changing the preview preference.
    player.setSyntheticPreview(
      simulatedBeatEnabled && playbackState === 'playing',
      24,
      simulatedBeatBpm / 120,
    )
    hasConfiguredSimulatedBeatRef.current = hasSimulatedBeat
  }, [hasSimulatedBeat, playbackState, playerVersion, simulatedBeatBpm, simulatedBeatEnabled, status])

  useEffect(() => {
    if (!onCaptureFramePreviewChange) {
      return
    }

    const player = playerRef.current

    if (status === 'ready' && typeof player?.captureFramePreview === 'function') {
      const capturedSource = sceneBlob
      onCaptureFramePreviewChange(async () => {
        const canvas = renderHostRef.current
        if (!canvas || playerRef.current !== player
          || latestSceneBlobRef.current !== capturedSource
          || !sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, capturedSource))) return null

        // The engine stretches its source to these dimensions. Read the live
        // viewport at capture time so resizing cannot squash the saved frame.
        const bounds = canvas.getBoundingClientRect()
        const sourceWidth = bounds.width > 0 ? bounds.width : canvas.clientWidth || 640
        const sourceHeight = bounds.height > 0 ? bounds.height : canvas.clientHeight || 360
        const scale = 512 / Math.max(sourceWidth, sourceHeight, 1)

        const frame = await player.captureFramePreview?.({
          ...boundCaptureSize(sourceWidth * scale, sourceHeight * scale),
          type: 'image/png',
        })
        return playerRef.current === player && latestSceneBlobRef.current === capturedSource
          && sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, capturedSource)) ? frame ?? null : null
      })

      return () => {
        onCaptureFramePreviewChange(null)
      }
    }

    onCaptureFramePreviewChange(null)

    return () => {
      onCaptureFramePreviewChange(null)
    }
  }, [onCaptureFramePreviewChange, playerVersion, sceneBlob, sceneKey, status])

  useEffect(() => {
    const player = playerRef.current

    if (!player || (status !== 'ready' && loadedPlayerVersion === null)) {
      return
    }

    const intervalId = window.setInterval(() => {
      setAudioState((currentAudioState) => {
        const nextAudioState = player.getAudioState()
        return audioStatesMatch(currentAudioState, nextAudioState) ? currentAudioState : nextAudioState
      })
    }, 250)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadedPlayerVersion, playerVersion, status])

  useEffect(() => {
    if (!isVolumeOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        volumeControlRef.current &&
        event.target instanceof Node &&
        !volumeControlRef.current.contains(event.target)
      ) {
        setIsVolumeOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsVolumeOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isVolumeOpen])

  useEffect(() => {
    if (status !== 'ready' || !audioState.isLoaded) {
      setIsVolumeOpen(false)
    }
  }, [audioState.isLoaded, status])

  useEffect(() => {
    const player = playerRef.current

    if (!player || status !== 'ready') {
      return
    }

    let isCancelled = false
    const generation = audioGenerationRef.current
    const isCurrent = () => !isCancelled && generation === audioGenerationRef.current && playerRef.current === player

    if (audioCandidate) {
      const candidate = audioCandidate
      void (async () => {
        try {
          if (pendingAudioRef.current?.player !== player || pendingAudioRef.current.trackId !== candidate.track.id) {
            pendingAudioRef.current = { player, trackId: candidate.track.id, result: player.loadAudio({
              sourceLabel: candidate.track.name, sourcePath: candidate.track.sourcePath, signal: candidate.signal,
            }) }
          }
          const nextAudioState = await pendingAudioRef.current.result
          if (!isCurrent() || candidate.signal.aborted) return
          // Mark the decoded song before publishing it to the playlist so the
          // next effect does not unload and decode this same song again.
          loadedTrackIdRef.current = candidate.track.id
          completedTrackIdRef.current = null
          pendingAudioRef.current = null
          setAudioState(nextAudioState)
          setAudioError(null)
          acceptAudioCandidate(candidate, nextAudioState.duration)
        } catch (error) {
          if (!isCurrent() || candidate.signal.aborted) return
          pendingAudioRef.current = null
          setAudioState(player.getAudioState())
          rejectAudioCandidate(candidate, error)
        }
      })()
      return () => { isCancelled = true }
    }

    if (tracks.length === 0) {
      try {
        if (loadedTrackIdRef.current !== null && player.getPlaybackState() !== 'paused') {
          requestedPlaybackRef.current.playback = 'paused'
          setPlaybackState(player.setPlaybackState('paused'))
        }

        loadedTrackIdRef.current = null
        pendingAudioRef.current = null
        setAudioState(player.clearAudio())
        setAudioError(null)
        setActiveAudioAction(null)
      } catch (error) {
        setAudioError(readMagePlayerErrorMessage(error))
      }

      return
    }

    if (!currentTrack || loadedTrackIdRef.current === currentTrack.id) {
      return
    }

    setActiveAudioAction('load')
    setAudioError(null)

    void (async () => {
      try {
        // A decode already in progress belongs to this controller/track. A
        // benign permission check must not unload and decode the same file.
        if (pendingAudioRef.current?.player !== player || pendingAudioRef.current.trackId !== currentTrack.id) {
          playlistLoadAbortRef.current?.abort()
          const controller = new AbortController()
          playlistLoadAbortRef.current = controller
          pendingAudioRef.current = { player, trackId: currentTrack.id, result: player.loadAudio({
            sourceLabel: currentTrack.title?.trim() || currentTrack.name,
            sourcePath: currentTrack.sourcePath,
            signal: controller.signal,
          }) }
        }
        const nextAudioState = await pendingAudioRef.current.result

        if (!isCurrent()) {
          return
        }

        loadedTrackIdRef.current = currentTrack.id
        pendingAudioRef.current = null
        setAudioState(nextAudioState)
        commitTrackDuration(currentTrack.id, nextAudioState.duration)
      } catch (error) {
        if (isCurrent()) {
          pendingAudioRef.current = null
          loadedTrackIdRef.current = null
          setAudioError(readMagePlayerErrorMessage(error))
        }
      } finally {
        if (isCurrent()) {
          setActiveAudioAction(null)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [acceptAudioCandidate, audioCandidate, commitTrackDuration, currentTrack, playerVersion, rejectAudioCandidate, requestedPlaybackRef, status, trackLoadVersion, tracks.length])

  useEffect(() => {
    if (availabilityPending || audioMode === 'single' || audioCandidate) return
    if (!currentTrack) {
      completedTrackIdRef.current = null
      return
    }

    if (completedTrackIdRef.current && completedTrackIdRef.current !== currentTrack.id) {
      completedTrackIdRef.current = null
    }

    if (
      playbackState !== 'playing' ||
      !audioState.isLoaded ||
      audioState.duration <= 0 ||
      loadedTrackIdRef.current !== currentTrack.id
    ) {
      return
    }

    const completionThreshold = Math.max(audioState.duration - 0.35, 0)

    if (audioState.currentTime < completionThreshold) {
      if (completedTrackIdRef.current === currentTrack.id) {
        completedTrackIdRef.current = null
      }

      return
    }

    if (completedTrackIdRef.current === currentTrack.id) {
      return
    }

    completedTrackIdRef.current = currentTrack.id

    let nextTrack: MagePlayerPlaylistTrack | null = tracks[currentTrackIndex] ?? null

    if (!nextTrack && repeatEnabled) {
      nextTrack = tracks[0] ?? null
    }

    if (!nextTrack) {
      return
    }

    if (nextTrack.id === currentTrack.id) {
      completedTrackIdRef.current = null
      loadedTrackIdRef.current = null
      setTrackLoadVersion((currentVersion) => currentVersion + 1)
      return
    }

    commitSelectedTrackId(nextTrack.id)
  }, [
    availabilityPending,
    audioMode,
    audioCandidate,
    audioState.currentTime,
    audioState.duration,
    audioState.isLoaded,
    commitSelectedTrackId,
    currentTrack,
    currentTrackIndex,
    playbackState,
    repeatEnabled,
    shuffleEnabled,
    tracks,
  ])

  const controlsBusy = availabilityPending || activeAudioAction !== null || audioSelection.adding
  const audioProgressPercent =
    audioState.duration > 0
      ? `${Math.min((audioState.currentTime / audioState.duration) * 100, 100)}%`
      : '0%'

  function handleTogglePlayback(event: ReactMouseEvent<HTMLButtonElement>) {
    const player = playerRef.current

    if (!player) return

    const nextPlaybackState = playbackState === 'playing' ? 'paused' : 'playing'
    // Stopping audio never needs permission to render. A new Play request still
    // waits for the current scene and fresh availability.
    if (nextPlaybackState === 'playing' && (status !== 'ready' || controlsBusy)) return
    requestedPlaybackRef.current.playback = nextPlaybackState
    setPlaybackState(player.setPlaybackState(nextPlaybackState))
    setAudioState(player.getAudioState())
    setAudioError(null)
    blurMouseActivatedControl(event.currentTarget, event.detail)
  }

  function handleOpenAudioPicker(event: ReactMouseEvent<HTMLButtonElement>) {
    if (controlsBusy || status !== 'ready') {
      return
    }
    audioSelection.open()
    blurMouseActivatedControl(event.currentTarget, event.detail)
  }

  function handleSeekAudio(event: ChangeEvent<HTMLInputElement>) {
    const player = playerRef.current

    if (!player || status !== 'ready' || controlsBusy || !audioState.isLoaded) {
      return
    }

    try {
      setAudioState(player.seekAudio(Number(event.currentTarget.value)))
      setAudioError(null)
    } catch (error) {
      setAudioError(readMagePlayerErrorMessage(error))
    }
  }

  function handleToggleVolumePanel() {
    if (!audioState.isLoaded || controlsBusy) {
      return
    }

    setIsVolumeOpen((currentState) => !currentState)
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const player = playerRef.current

    if (!player || status !== 'ready' || controlsBusy) {
      return
    }

    try {
      setAudioState(player.setAudioVolume(Number(event.currentTarget.value)))
      setAudioError(null)
    } catch (error) {
      setAudioError(readMagePlayerErrorMessage(error))
    }
  }

  function handleTrackSummaryClick(event: ReactMouseEvent<HTMLButtonElement>) {
    onRequestPlaylistOpen?.()
    blurMouseActivatedControl(event.currentTarget, event.detail)
  }

  let title = 'No scene selected.'
  let message = 'Pass a scene blob into this player to render it in the browser.'
  let role: 'alert' | 'status' = 'status'

  if (status === 'error') {
    title = 'Unable to render this scene.'
    message = loadError?.message ?? 'MAGE could not render this scene.'
    role = 'alert'
  }

  return (
    <section className={buildMagePlayerClassName('mage-player', className)} data-state={status} data-availability-pending={availabilityPending || undefined}>
      <div className="mage-player__viewport" aria-busy={status === 'loading'}>
        <div aria-label={ariaLabel} className="mage-player__render-host" ref={renderHostRef} role="img" />
        {availabilityPending ? (
          <div className="mage-player__availability-check" role="status">Checking whether this scene can play…</div>
        ) : status === 'loading' ? (
          <MagePlayerLoading />
        ) : status !== 'ready' ? (
          <div className="mage-player__overlay" role={role} aria-live="polite">
            <div className="mage-player__overlay-copy">
              <strong>{title}</strong>
              <p>{message}</p>
            </div>
          </div>
        ) : null}
      </div>
        {sceneBlob ? (
          <MagePlayerControls
            audioMode={audioMode}
            disabled={status !== 'ready'}
            activeAudioAction={audioSelection.adding ? 'add' : activeAudioAction}
            audioError={audioSelection.error ?? audioError}
            audioProgressPercent={audioProgressPercent}
            audioState={audioState}
            currentTrack={currentTrack}
            currentTrackIndex={currentTrackIndex}
            isVolumeOpen={isVolumeOpen}
            onOpenAudioPicker={handleOpenAudioPicker}
            onSeekAudio={handleSeekAudio}
            onTogglePlayback={handleTogglePlayback}
            onToggleVolumePanel={handleToggleVolumePanel}
            onTrackSummaryClick={handleTrackSummaryClick}
            onVolumeChange={handleVolumeChange}
            onStopScene={onStopRendering}
            onPauseAllScenes={onSafeMode}
            onClearMusic={clearMusic}
            playbackState={playbackState}
            showPlaylistButton={Boolean(onRequestPlaylistOpen)}
            tracksCount={tracks.length}
            volumeControlRef={volumeControlRef}
          />
        ) : null}
    </section>
  )
}
