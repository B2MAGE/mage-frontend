import {
  setAnimatedSceneThumbnailsEnabled,
  useAnimatedSceneThumbnailsEnabled,
} from '@shared/preferences'

export function AnimatedThumbnailSetting() {
  const animatedThumbnailsEnabled = useAnimatedSceneThumbnailsEnabled()

  return (
    <div className="animated-thumbnail-setting">
      <div className="animated-thumbnail-setting__copy">
        <strong id="animated-thumbnail-setting-label">Animated scene thumbnails</strong>
        <span id="animated-thumbnail-setting-description">
          Play a silent scene preview when you hover over or focus a scene thumbnail. Devices
          that prefer reduced motion remain static.
        </span>
      </div>

      <label className="animated-thumbnail-setting__control">
        <input
          aria-describedby="animated-thumbnail-setting-description"
          aria-labelledby="animated-thumbnail-setting-label"
          checked={animatedThumbnailsEnabled}
          className="animated-thumbnail-setting__input"
          onChange={(event) => setAnimatedSceneThumbnailsEnabled(event.currentTarget.checked)}
          role="switch"
          type="checkbox"
        />
        <span aria-hidden="true" className="animated-thumbnail-setting__switch">
          <span className="animated-thumbnail-setting__thumb" />
        </span>
      </label>
    </div>
  )
}
