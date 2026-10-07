import { useId } from 'react'
import { buildMagePlayerClassName } from '../magePlayerUtils'
import { MagePlayerDisabledControls } from '../MagePlayerControls'
import { PauseAllScenesToggle } from './PauseAllScenesToggle'
import type { RecoveryBlock } from './sceneRecovery'

type Props = {
  className?: string
  posterUrl?: string | null
  block: RecoveryBlock | null
  safeMode: boolean
  onRetry: () => void
  onSafeModeChange: (enabled: boolean) => void
  audioMode?: 'single' | 'playlist'
}

export function SceneRecoveryPanel({ className, posterUrl, block, safeMode, onRetry, onSafeModeChange, audioMode }: Props) {
  const messageId = useId()
  const interrupted = block?.reason === 'interrupted'
  const stopped = block?.reason === 'stopped'
  const compileRejected = block?.reason === 'compile'
  const message = safeMode ? 'All scenes and previews are paused. Turn off Pause all scenes to resume playback.'
    : stopped ? "You paused this scene. Resume it when you're ready."
      : interrupted ? "The previous playback may have been interrupted. It won't restart automatically."
        : compileRejected ? "This shader could not be prepared for playback. Simplify the shader code or choose a template, then try again. It won't restart automatically."
          : 'This scene stopped because of a playback error. You can retry it.'

  return <section className={buildMagePlayerClassName('mage-player', className)} data-state="blocked">
    <div className="mage-player__viewport mage-player__recovery-viewport">
      {posterUrl ? <img className="mage-player__recovery-poster" src={posterUrl} alt="" /> : null}
      <div className="mage-player__recovery-panel">
        <div role="status" aria-live="polite">
          <strong>Playback paused</strong>
          <p id={messageId}>{message}</p>
        </div>
        <div className="mage-player__recovery-actions">
          <button type="button" disabled={safeMode} aria-describedby={messageId} onClick={onRetry}>
            {safeMode || stopped ? 'Resume scene' : 'Retry scene'}
          </button>
          <PauseAllScenesToggle checked={safeMode} onChange={onSafeModeChange} />
        </div>
      </div>
    </div>
    <MagePlayerDisabledControls audioMode={audioMode} />
  </section>
}
