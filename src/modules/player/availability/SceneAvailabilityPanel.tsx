import { buildMagePlayerClassName } from '../magePlayerUtils'

export function SceneAvailabilityPanel({ className, posterUrl, message, checking = false, onCheck }: {
  className?: string
  posterUrl?: string | null
  message: string
  checking?: boolean
  onCheck?: () => void
}) {
  return <section className={buildMagePlayerClassName('mage-player', className)} data-state="unavailable">
    <div className="mage-player__viewport mage-player__recovery-viewport">
      {posterUrl ? <img className="mage-player__recovery-poster" src={posterUrl} alt="" /> : null}
      <div className="mage-player__recovery-panel">
        <div role="status" aria-live="polite">
          <strong>{checking ? 'Checking playback' : 'Playback unavailable'}</strong>
          <p>{message}</p>
        </div>
        {onCheck ? <div className="mage-player__recovery-actions">
          <button type="button" onClick={onCheck}>Check again</button>
        </div> : null}
      </div>
    </div>
  </section>
}
