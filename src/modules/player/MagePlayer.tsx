import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
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
import { MagePlayerControls } from './MagePlayerControls'
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
import { normalizeAudioResponseMode } from '@shared/lib'
import { hasSceneDocumentMarkers } from './templates/sceneContract'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { SceneRecoveryPanel } from './recovery/SceneRecoveryPanel'
import { PlaybackOptions } from './recovery/PlaybackOptions'
import { sceneAvailabilityStore } from './availability/sceneAvailability'
import { availabilityStatusTarget, availabilityTarget } from './availability/availabilityTarget'
import { useSceneAvailability } from './availability/useSceneAvailability'
import { SceneAvailabilityPanel } from './availability/SceneAvailabilityPanel'
import { validateSceneForPlayback } from './policy/sceneValidation'
import { boundCaptureSize, type RenderProfile } from './policy/renderBudget'

export type MagePlayerAudioResponseCapabilitiesSnapshot = {
  sceneBlob: MageSceneBlob
  capabilities: MageAudioResponseCapabilities
}

export type MagePlayerProps = {
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
  const playlist = useMagePlayerPlaylist(props)
  const audioSelection = useMagePlayerAudioSelection({
    inputRef: audioInputRef,
    playlist,
    sceneIdentity: scenePlaybackIdentity(props.sceneBlob, props.sceneKey),
    onRequestPlaylistOpen: props.onRequestPlaylistOpen,
  })
  return <>
    <input accept="audio/*" className="mage-player__audio-input" hidden multiple
      onChange={event => { void audioSelection.select(event) }} ref={audioInputRef} type="file" />
    <MagePlayerSession {...props} playlist={playlist} audioSelection={audioSelection} />
  </>
}

type SessionAudioProps = {
  playlist: ReturnType<typeof useMagePlayerPlaylist>
  audioSelection: ReturnType<typeof useMagePlayerAudioSelection>
}

function MagePlayerSession(props: MagePlayerProps & SessionAudioProps) {
  const validationError = useMemo(() => {
    if (!props.sceneBlob) return null
    try { validateSceneForPlayback(props.sceneBlob); return null }
    catch (error) { return readMagePlayerErrorMessage(error) }
  }, [props.sceneBlob])
  useSyncExternalStore(sceneRecovery.subscribe, sceneRecovery.getSnapshot, sceneRecovery.getSnapshot)
  const [rendererInstance, setRendererInstance] = useState(0)
  const { playlist, audioSelection } = props
  const recoveryKey = useMemo(() => sceneRecoveryKey(props.recoverySceneBlob ?? props.sceneBlob, props.sceneKey), [props.recoverySceneBlob, props.sceneBlob, props.sceneKey])
  const block = recoveryKey ? sceneRecovery.getBlock(recoveryKey) : null
  const safeMode = sceneRecovery.isSafeMode()
  const target = useMemo(() => props.sceneBlob ? availabilityTarget(props.sceneKey, props.sceneBlob)
    : availabilityStatusTarget(props.sceneKey), [props.sceneKey, props.sceneBlob])
  const availability = useSceneAvailability(target)
  const requiresAvailability = !!props.sceneBlob || target !== 'custom'
  const [reloadAttempt, setReloadAttempt] = useState(0)
  const [sourceError, setSourceError] = useState(false)
  const restoreSourceRef = useRef(props.onAvailabilityRestored)
  useEffect(() => { restoreSourceRef.current = props.onAvailabilityRestored }, [props.onAvailabilityRestored])
  const hasSource = !!props.sceneBlob
  const canRestoreSource = !!props.onAvailabilityRestored

  useEffect(() => {
    if (!availability.allowed && recoveryKey) sceneRecovery.revokeRetry(recoveryKey)
  }, [availability.allowed, recoveryKey])

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
    if (!recoveryKey || !availability.allowed) return
    const release = sceneRecovery.retainPlaybackSession(recoveryKey)
    return () => {
      // Cleanup runs before the new effect. Revoke first so a server stop cannot
      // retire a remembered interruption through a suspended local retry.
      if (!sceneAvailabilityStore.isAllowed(target)) sceneRecovery.revokeRetry(recoveryKey)
      release()
    }
  }, [availability.allowed, recoveryKey, target])

  useEffect(() => {
    // A cached browser page retains React state, but pagehide has shut down its
    // graphics resources. Recreate only the renderer, keeping the editor/playlist.
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted) setRendererInstance((instance) => instance + 1)
    }
    window.addEventListener('pageshow', restorePage)
    return () => window.removeEventListener('pageshow', restorePage)
  }, [])

  if (requiresAvailability && (!availability.allowed || !props.sceneBlob)) {
    return <SceneAvailabilityPanel className={props.className} posterUrl={props.posterUrl}
      message={!availability.allowed ? availability.message : sourceError
        ? 'This scene could not be loaded. You can check again.' : canRestoreSource
          ? 'Loading this scene…' : 'This scene is temporarily unavailable.'}
      checking={availability.code === 'CHECKING' || (availability.allowed && canRestoreSource && !sourceError)}
      onCheck={availability.code === 'STATUS_UNAVAILABLE' ? () => { void sceneAvailabilityStore.check(target) }
        : availability.allowed && sourceError ? () => setReloadAttempt((value) => value + 1) : undefined}
    />
  }

  if (props.sceneBlob && (block || safeMode)) {
    return <SceneRecoveryPanel
      className={props.className}
      posterUrl={props.posterUrl}
      block={block}
      safeMode={safeMode}
      onRetry={() => {
        if (!recoveryKey || !sceneAvailabilityStore.isAllowed(target)) return
        if (block?.reason === 'stopped') sceneRecovery.resumeStoppedScene(recoveryKey, block.at)
        else sceneRecovery.retry(recoveryKey)
      }}
      onSafeModeChange={sceneRecovery.setSafeMode}
    />
  }

  if (validationError) {
    return <section className={buildMagePlayerClassName('mage-player', props.className)} data-state="error">
      <div className="mage-player__viewport">
        <div className="mage-player__overlay" role="alert">
          <div className="mage-player__overlay-copy"><strong>This scene needs changes.</strong><p>{validationError}</p></div>
        </div>
      </div>
    </section>
  }

  return <MagePlayerRenderer key={`${target}:${rendererInstance}`} {...props}
    playlist={playlist}
    audioSelection={audioSelection}
    onStopRendering={recoveryKey ? () => sceneRecovery.block(recoveryKey, 'stopped') : undefined}
    onSafeMode={() => sceneRecovery.setSafeMode(true)}
  />
}

function MagePlayerRenderer({
  ariaLabel = 'MAGE scene preview',
  className,
  initialPlayback = 'playing',
  log = false,
  renderProfile = 'full',
  onAudioResponseCapabilitiesChange,
  onEngineDiagnosticsChange,
  onCaptureFramePreviewChange,
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
}: MagePlayerProps & { onStopRendering?: () => void; onSafeMode: () => void } & SessionAudioProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const volumeControlRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<MagePlayerController | null>(null)
  const capabilitiesCallbackRef = useRef(onAudioResponseCapabilitiesChange)
  const diagnosticsCallbackRef = useRef(onEngineDiagnosticsChange)
  const latestSceneBlobRef = useRef<MageSceneBlob | null | undefined>(sceneBlob)
  const requestedPlaybackRef = useRef<MagePlayerPlaybackState>(initialPlayback)
  const loadedTrackIdRef = useRef<string | null>(null)
  const completedTrackIdRef = useRef<string | null>(null)
  const hasConfiguredSimulatedBeatRef = useRef(false)
  const appliedSceneRef = useRef<{ player: MagePlayerController; identity: string | null } | null>(null)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)

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

  useEffect(() => {
    capabilitiesCallbackRef.current = onAudioResponseCapabilitiesChange
  }, [onAudioResponseCapabilitiesChange])

  useEffect(() => {
    diagnosticsCallbackRef.current = onEngineDiagnosticsChange
  }, [onEngineDiagnosticsChange])

  useEffect(() => {
    latestSceneBlobRef.current = sceneBlob
  }, [sceneBlob])

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
    requestedPlaybackRef.current = initialPlayback
    setPlaybackState(initialPlayback)

    const player = playerRef.current

    if (!player) {
      return
    }

    setPlaybackState(player.setPlaybackState(initialPlayback))
    setAudioState(player.getAudioState())
  }, [initialPlayback])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let nextPlayer: MagePlayerController | null = null
    let isDisposed = false
    let animationFrameId = 0
    const disposePlayer = () => {
      try { nextPlayer?.dispose() } catch {
        // The adapter retains its marker when cleanup fails. Recovery controls
        // and unsaved editor state must survive that failure too.
      }
    }

    animationFrameId = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          nextPlayer = await createMagePlayer(canvas, { log, renderProfile, initialSceneBlob: latestSceneBlobRef.current ?? undefined, mouseInteractions: true, mouseWheelZoom: true, ...(sceneKey === undefined ? {} : { sceneKey }) })

          if (isDisposed) {
            disposePlayer()
            return
          }

          playerRef.current = nextPlayer
          setPlaybackState(nextPlayer.setPlaybackState(requestedPlaybackRef.current))
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
      window.cancelAnimationFrame(animationFrameId)
      playerRef.current = null
      capabilitiesCallbackRef.current?.(null)
      diagnosticsCallbackRef.current?.(null)
      disposePlayer()
    }
  }, [log, sceneKey, renderProfile])

  useEffect(() => {
    if (!sceneBlob) {
      appliedSceneRef.current = null
      loadedTrackIdRef.current = null
      completedTrackIdRef.current = null
      return
    }

    const player = playerRef.current

    if (!player) {
      return
    }

    let isCancelled = false

    try {
      const isResponseUpdate = playbackIdentity !== null
        && !hasSceneDocumentMarkers(sceneBlob)
        && appliedSceneRef.current?.player === player
        && appliedSceneRef.current.identity === playbackIdentity
      if (isResponseUpdate) {
          player.setAudioResponseSettings(
            Object.hasOwn(sceneBlob, 'audioResponse') ? normalizeAudioResponseMode(sceneBlob.audioResponse) : undefined,
            sceneBlob.audioResponseConfig,
          )
          player.updateRecoveryIdentity?.(sceneBlob, recoverySceneBlob === undefined ? { sceneKey } : { sceneKey, recoverySceneBlob })
        } else {
          if (recoverySceneBlob !== undefined) player.loadSceneBlob(sceneBlob, { sceneKey, recoverySceneBlob })
          else if (sceneKey === undefined) player.loadSceneBlob(sceneBlob)
          else player.loadSceneBlob(sceneBlob, { sceneKey })
        loadedTrackIdRef.current = null
        completedTrackIdRef.current = null
      }
      appliedSceneRef.current = { player, identity: playbackIdentity }
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
        requestedPlaybackRef.current = nextPlaybackState
        setLoadError(null)
        setLoadedSceneIdentity(playbackIdentity)
        setLoadedPlayerVersion(playerVersion)
        setPlaybackState(nextPlaybackState)
        setAudioState(player.getAudioState())
        if (!isResponseUpdate) {
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

    return () => {
      isCancelled = true
    }
    }, [playbackIdentity, playerVersion, recoverySceneBlob, sceneBlob, sceneKey])

  const status: MagePlayerStatus =
    !sceneBlob
      ? 'empty'
      : loadError?.sceneBlob === sceneBlob
        ? 'error'
        : playbackIdentity !== null && loadedSceneIdentity === playbackIdentity && loadedPlayerVersion === playerVersion
          ? 'ready'
          : 'loading'

  const hasCapabilitiesCallback = Boolean(onAudioResponseCapabilitiesChange)

  useEffect(() => {
    if (!hasCapabilitiesCallback) return
    const matchesCompiledPlayer = status === 'ready'
      && capabilitiesResult?.player === playerRef.current
      && capabilitiesResult?.identity === playbackIdentity
    // Response-only edits keep the same compiled shader. Retain its published
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
      let cancelled = false
      const capturedSource = sceneBlob
      onCaptureFramePreviewChange(async () => {
        const canvas = canvasRef.current
        if (!canvas || cancelled || playerRef.current !== player
          || latestSceneBlobRef.current !== capturedSource
          || !sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, capturedSource))) return null

        // The engine stretches its source to these dimensions. Read the live
        // viewport at capture time so resizing cannot squash the saved frame.
        const bounds = canvas.getBoundingClientRect()
        const sourceWidth = bounds.width > 0 ? bounds.width : canvas.width
        const sourceHeight = bounds.height > 0 ? bounds.height : canvas.height
        const scale = 512 / Math.max(sourceWidth, sourceHeight, 1)

        const frame = await player.captureFramePreview?.({
          ...boundCaptureSize(sourceWidth * scale, sourceHeight * scale),
          type: 'image/png',
        })
        return !cancelled && playerRef.current === player && latestSceneBlobRef.current === capturedSource
          && sceneAvailabilityStore.isAllowed(availabilityTarget(sceneKey, capturedSource)) ? frame ?? null : null
      })

      return () => {
        cancelled = true
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

    if (!player || status !== 'ready') {
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
  }, [playerVersion, status])

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

    if (tracks.length === 0) {
      try {
        if (loadedTrackIdRef.current !== null && player.getPlaybackState() !== 'paused') {
          requestedPlaybackRef.current = 'paused'
          setPlaybackState(player.setPlaybackState('paused'))
        }

        loadedTrackIdRef.current = null
        setAudioState(player.clearAudio())
        setAudioError(null)
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
        const nextAudioState = await player.loadAudio({
          sourceLabel: currentTrack.title?.trim() || currentTrack.name,
          sourcePath: currentTrack.sourcePath,
        })

        if (isCancelled) {
          return
        }

        loadedTrackIdRef.current = currentTrack.id
        setAudioState(nextAudioState)
        commitTrackDuration(currentTrack.id, nextAudioState.duration)
      } catch (error) {
        if (!isCancelled) {
          loadedTrackIdRef.current = null
          setAudioError(readMagePlayerErrorMessage(error))
        }
      } finally {
        if (!isCancelled) {
          setActiveAudioAction(null)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [commitTrackDuration, currentTrack, playerVersion, status, trackLoadVersion, tracks.length])

  useEffect(() => {
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

  const controlsBusy = activeAudioAction !== null || audioSelection.adding
  const audioProgressPercent =
    audioState.duration > 0
      ? `${Math.min((audioState.currentTime / audioState.duration) * 100, 100)}%`
      : '0%'

  function handleTogglePlayback(event: ReactMouseEvent<HTMLButtonElement>) {
    const player = playerRef.current

    if (!player || status !== 'ready' || controlsBusy) {
      return
    }

    const nextPlaybackState = playbackState === 'playing' ? 'paused' : 'playing'
    requestedPlaybackRef.current = nextPlaybackState
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
    <section className={buildMagePlayerClassName('mage-player', className)} data-state={status}>
      <div className="mage-player__viewport" aria-busy={status === 'loading'}>
        <canvas aria-label={ariaLabel} className="mage-player__canvas" ref={canvasRef} />
        {status === 'loading' ? (
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
        {status === 'ready' ? (
          <MagePlayerControls
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
            playbackState={playbackState}
            showPlaylistButton={Boolean(onRequestPlaylistOpen)}
            tracksCount={tracks.length}
            volumeControlRef={volumeControlRef}
          />
        ) : sceneBlob ? <div className="mage-player__controls mage-player__controls--recovery-only">
          <PlaybackOptions onStopScene={onStopRendering} onPauseAllScenes={onSafeMode} />
        </div> : null}
    </section>
  )
}
