import { useId } from 'react'
import { buildMagePlayerClassName } from '../magePlayerUtils'
import { MagePlayerDisabledControls } from '../MagePlayerControls'

export function SceneAvailabilityPanel({ className, posterUrl, message, checking = false, onCheck, audioMode }: {
  className?: string
  posterUrl?: string | null
  message: string
  checking?: boolean
  onCheck?: () => void
  audioMode?: 'single' | 'playlist'
}) {
  const titleId = useId(), messageId = useId()
  return <section className={buildMagePlayerClassName('mage-player', className)} data-state="unavailable" aria-labelledby={titleId} aria-describedby={messageId}>
    <div className="mage-player__viewport mage-player__recovery-viewport mage-player__availability-viewport">
      {posterUrl ? <img className="mage-player__recovery-poster" src={posterUrl} alt="" /> : null}
      <div className="mage-player__recovery-panel mage-player__availability-panel">
        <div role="status" aria-live="polite">
          <strong id={titleId}>{checking ? 'Checking playback' : 'Playback unavailable'}</strong>
          <p id={messageId}>{message}</p>
        </div>
        {onCheck ? <div className="mage-player__recovery-actions">
          <button type="button" disabled={checking} onClick={onCheck}>Check again</button>
        </div> : null}
      </div>
    </div>
    <MagePlayerDisabledControls audioMode={audioMode} />
  </section>
}
