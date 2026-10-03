import { buildMagePlayerClassName } from '../magePlayerUtils'
import type { RecoveryBlock } from './sceneRecovery'

type Props = {
  className?: string
  posterUrl?: string | null
  block: RecoveryBlock | null
  safeMode: boolean
  onRetry: () => void
  onSafeModeChange: (enabled: boolean) => void
}

export function SceneRecoveryPanel({ className, posterUrl, block, safeMode, onRetry, onSafeModeChange }: Props) {
  const interrupted = block?.reason === 'interrupted'
  const stopped = block?.reason === 'stopped'
  const title = safeMode ? 'Safe mode is on.'
    : stopped ? 'Rendering stopped.'
      : interrupted ? 'Playback may have been interrupted.'
        : 'This scene could not keep rendering.'
  const message = safeMode ? 'Automatic rendering is off. You can keep browsing and editing.'
    : stopped ? 'This version stays paused until you choose to render it again.'
      : interrupted ? 'The last playback did not finish cleanly. It will not restart automatically.'
        : 'Automatic playback is paused for this version. You can leave the scene or try again.'

  return <section className={buildMagePlayerClassName('mage-player', className)} data-state="blocked">
    <div className="mage-player__viewport mage-player__recovery-viewport">
      {posterUrl ? <img className="mage-player__recovery-poster" src={posterUrl} alt="" /> : null}
      <div className="mage-player__recovery-panel" role="status" aria-live="polite">
        <strong>{title}</strong>
        <p>{message}</p>
        <div className="mage-player__recovery-actions">
          {safeMode ? <button type="button" onClick={() => onSafeModeChange(false)}>Leave safe mode</button>
            : <>
              <button type="button" onClick={onRetry}>{stopped ? 'Resume rendering' : 'Retry scene'}</button>
              <button type="button" onClick={() => onSafeModeChange(true)}>Browse in safe mode</button>
            </>}
        </div>
      </div>
    </div>
  </section>
}
