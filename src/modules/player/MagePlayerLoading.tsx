import { LoadingRegion } from '@shared/ui'
import './magePlayer.css'

export function MagePlayerLoading() {
  return (
    <LoadingRegion
      className="mage-player__overlay mage-player__overlay--loading"
      label="Loading scene preview."
    >
      <div className="mage-player__overlay-copy">
        <span className="mage-player__loading-indicator" />
        <strong>Loading preview</strong>
      </div>
    </LoadingRegion>
  )
}
