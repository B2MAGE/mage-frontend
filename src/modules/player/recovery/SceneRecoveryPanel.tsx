import { useId } from 'react'
import { buildMagePlayerClassName } from '../magePlayerUtils'
import { MagePlayerDisabledControls } from '../MagePlayerControls'
import { PauseAllScenesToggle } from './PauseAllScenesToggle'
import type { RecoveryBlock, RecoveryReason } from './sceneRecovery'
import { isShaderWorkloadFailure, SHADER_WORKLOAD_MESSAGES } from '../policy/shaderWorkloadFailure'
import { downloadPlaybackDiagnostics } from '../isolation/playbackDiagnostics'

type Props = {
  className?: string
  posterUrl?: string | null
  block: RecoveryBlock | null
  safeMode: boolean
  onRetry: () => void
  onSafeModeChange: (enabled: boolean) => void
  audioMode?: 'single' | 'playlist'
  showPlaylistButton?: boolean
}

const recoveryMessages: Record<RecoveryReason, string> = {
  ...SHADER_WORKLOAD_MESSAGES,
  load: 'This scene could not be loaded for playback. You can retry it.',
  'compiler-download': 'The scene compiler could not be downloaded. Check your connection, then retry.',
  'graphics-download': 'The scene player could not be downloaded. Check your connection, then retry.',
  'graphics-startup': 'The browser could not start graphics for this scene. You can retry it.',
  'compiler-startup': 'The scene compiler did not start in time. You can retry it.',
  compile: 'This shader could not be prepared for playback. Simplify the shader code or choose a template, then try again.',
  'compile-timeout': 'Preparing this scene took too long. Simplify the shader code or choose a template, then retry.',
  'invalid-output': 'The scene compiler returned an invalid result. Try again, or choose another scene.',
  runtime: 'This scene stopped because of a playback error. You can retry it.',
  'context-lost': 'The browser lost its graphics connection. You can retry the scene.',
  'startup-timeout': 'The scene player did not start in time. You can retry it.',
  'progress-timeout': 'This scene stopped responding during playback. You can retry it.',
  stopped: "You paused this scene. Resume it when you're ready.",
  interrupted: 'Playback was interrupted. You can retry the scene.',
}

export function SceneRecoveryPanel({ className, posterUrl, block, safeMode, onRetry, onSafeModeChange, audioMode, showPlaylistButton }: Props) {
  const messageId = useId()
  const stopped = block?.reason === 'stopped'
  const needsChanges = !safeMode && isShaderWorkloadFailure(block?.reason)
  const message = safeMode ? 'All scenes and previews on this page are paused. Turn off Pause all scenes to resume playback.'
    : block ? recoveryMessages[block.reason] : 'This scene is paused. You can resume it.'

  return <section className={buildMagePlayerClassName('mage-player', className)}
    data-recovery-reason={safeMode ? 'safe-mode' : block?.reason} data-state="blocked">
    <div className="mage-player__viewport mage-player__recovery-viewport">
      {posterUrl ? <img className="mage-player__recovery-poster" src={posterUrl} alt="" /> : null}
      <div className="mage-player__recovery-panel">
        <div role="status" aria-live="polite">
          <strong>{needsChanges ? 'Scene needs changes' : 'Playback paused'}</strong>
          <p id={messageId}>{message}</p>
        </div>
        <div className="mage-player__recovery-actions">
          {!needsChanges && <button type="button" disabled={safeMode} aria-describedby={messageId} onClick={onRetry}>
            {safeMode || stopped ? 'Resume scene' : 'Retry scene'}
          </button>}
          <PauseAllScenesToggle checked={safeMode} onChange={onSafeModeChange} />
          {!safeMode && block && !stopped && <button type="button" onClick={downloadPlaybackDiagnostics}>Save playback report</button>}
        </div>
      </div>
    </div>
    <MagePlayerDisabledControls audioMode={audioMode} showPlaylistButton={showPlaylistButton} />
  </section>
}
