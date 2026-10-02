import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { MagePlayerLoading } from './MagePlayerLoading'
import {
  createMagePlayer,
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
  createPlaylistTrackId,
  EMPTY_AUDIO_STATE,
  readAudioFileDuration,
  readMagePlayerErrorMessage,
  type MagePlayerStatus,
} from './magePlayerUtils'
import { useMagePlayerPlaylist } from './useMagePlayerPlaylist'
import { scenePlaybackIdentity, type MageSceneKey } from './scenePlaybackIdentity'
import { normalizeAudioResponseMode } from '@shared/lib'

export type MagePlayerProps = {
  ariaLabel?: string
  className?: string
  initialPlayback?: MagePlayerPlaybackState
  log?: boolean
  onCaptureFramePreviewChange?: (
    captureFramePreview: (() => Promise<string | null>) | null,
  ) => void
  onPlaylistChange?: (tracks: MagePlayerPlaylistTrack[]) => void
  onRequestPlaylistOpen?: () => void
  onSelectedTrackChange?: (trackId: string | null) => void
  onTrackDurationChange?: (trackId: string, duration: number) => void
  playlistTracks?: MagePlayerPlaylistTrack[]
  repeatEnabled?: boolean
  sceneBlob: MageSceneBlob | null | undefined
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

export function MagePlayer({
  ariaLabel = 'MAGE scene preview',
  className,
  initialPlayback = 'playing',
  log = false,
  onCaptureFramePreviewChange,
  onPlaylistChange,
  onRequestPlaylistOpen,
  onSelectedTrackChange,
  onTrackDurationChange,
  playlistTracks,
  repeatEnabled = false,
  sceneBlob,
  sceneKey,
  selectedTrackId,
  shuffleEnabled = false,
  simulatedBeat,
}: MagePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const volumeControlRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<MagePlayerController | null>(null)
  const latestSceneBlobRef = useRef<MageSceneBlob | null | undefined>(sceneBlob)
  const requestedPlaybackRef = useRef<MagePlayerPlaybackState>(initialPlayback)
  const loadedTrackIdRef = useRef<string | null>(null)
  const completedTrackIdRef = useRef<string | null>(null)
  const hasConfiguredSimulatedBeatRef = useRef(false)
  const appliedSceneRef = useRef<{ player: MagePlayerController; identity: string | null } | null>(null)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)

  const {
    commitPlaylistTracks,
    commitSelectedTrackId,
    commitTrackDuration,
    currentTrack,
    currentTrackIndex,
    tracks,
  } = useMagePlayerPlaylist({
    onPlaylistChange,
    onSelectedTrackChange,
    onTrackDurationChange,
    playlistTracks,
    sceneBlob,
    sceneKey,
    selectedTrackId,
  })

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

    animationFrameId = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          nextPlayer = await createMagePlayer(canvas, { log, mouseInteractions: true, mouseWheelZoom: true })

          if (isDisposed) {
            nextPlayer.dispose()
            return
          }

          playerRef.current = nextPlayer
          setPlaybackState(nextPlayer.setPlaybackState(requestedPlaybackRef.current))
          setAudioState(nextPlayer.getAudioState())
          setPlayerVersion((currentVersion) => currentVersion + 1)
        } catch (error) {
          nextPlayer?.dispose()

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
      nextPlayer?.dispose()
    }
  }, [log])

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
        && appliedSceneRef.current?.player === player
        && appliedSceneRef.current.identity === playbackIdentity
      if (isResponseUpdate) {
        player.setAudioResponseSettings(
          Object.hasOwn(sceneBlob, 'audioResponse') ? normalizeAudioResponseMode(sceneBlob.audioResponse) : undefined,
          sceneBlob.audioResponseConfig,
        )
      } else {
        player.loadSceneBlob(sceneBlob)
        loadedTrackIdRef.current = null
        completedTrackIdRef.current = null
      }
      appliedSceneRef.current = { player, identity: playbackIdentity }
      const nextPlaybackState = player.getPlaybackState()

      queueMicrotask(() => {
        if (isCancelled) {
          return
        }

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
        if (isCancelled) {
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
  }, [playbackIdentity, playerVersion, sceneBlob])

  const status: MagePlayerStatus =
    !sceneBlob
      ? 'empty'
      : loadError?.sceneBlob === sceneBlob
        ? 'error'
        : playbackIdentity !== null && loadedSceneIdentity === playbackIdentity && loadedPlayerVersion === playerVersion
          ? 'ready'
          : 'loading'

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
      onCaptureFramePreviewChange(() => {
        const canvas = canvasRef.current
        if (!canvas) return Promise.resolve(null)

        // The engine stretches its source to these dimensions. Read the live
        // viewport at capture time so resizing cannot squash the saved frame.
        const bounds = canvas.getBoundingClientRect()
        const sourceWidth = bounds.width > 0 ? bounds.width : canvas.width
        const sourceHeight = bounds.height > 0 ? bounds.height : canvas.height
        const scale = 512 / Math.max(sourceWidth, sourceHeight, 1)

        return player.captureFramePreview?.({
          height: Math.max(1, Math.round(sourceHeight * scale)),
          type: 'image/png',
          width: Math.max(1, Math.round(sourceWidth * scale)),
        }) ?? Promise.resolve(null)
      })

      return () => {
        onCaptureFramePreviewChange(null)
      }
    }

    onCaptureFramePreviewChange(null)

    return () => {
      onCaptureFramePreviewChange(null)
    }
  }, [onCaptureFramePreviewChange, playerVersion, status])

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

  const controlsBusy = activeAudioAction !== null
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
    const audioInput = audioInputRef.current

    if (!audioInput || controlsBusy || status !== 'ready') {
      return
    }

    audioInput.value = ''
    audioInput.click()
    blurMouseActivatedControl(event.currentTarget, event.detail)
  }

  async function handleAudioSelection() {
    const audioInput = audioInputRef.current

    if (!audioInput) {
      return
    }

    const selectedFiles = Array.from(audioInput.files ?? [])

    if (selectedFiles.length === 0) {
      return
    }

    setActiveAudioAction('add')
    setAudioError(null)

    try {
      const nextTracks = await Promise.all(
        selectedFiles.map(async (selectedFile) => {
          const sourcePath = URL.createObjectURL(selectedFile)
          const duration = await readAudioFileDuration(sourcePath)

          return {
            duration,
            id: createPlaylistTrackId(),
            name: selectedFile.name,
            sourcePath,
            sourceType: 'device' as const,
          }
        }),
      )

      const nextPlaylist = [...tracks, ...nextTracks]
      commitPlaylistTracks(nextPlaylist)

      if (!currentTrack && nextTracks[0]) {
        commitSelectedTrackId(nextTracks[0].id)
      }

      onRequestPlaylistOpen?.()
    } catch (error) {
      setAudioError(readMagePlayerErrorMessage(error))
    } finally {
      setActiveAudioAction(null)
      audioInput.value = ''
    }
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
        <input
          accept="audio/*"
          className="mage-player__audio-input"
          hidden
          multiple
          onChange={() => {
            void handleAudioSelection()
          }}
          ref={audioInputRef}
          type="file"
        />
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
            activeAudioAction={activeAudioAction}
            audioError={audioError}
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
            playbackState={playbackState}
            showPlaylistButton={Boolean(onRequestPlaylistOpen)}
            tracksCount={tracks.length}
            volumeControlRef={volumeControlRef}
          />
        ) : null}
    </section>
  )
}
