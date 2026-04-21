import { type AppThemeDefinition, useTheme } from '@theme'
import { SurfaceCard } from '@shared/ui'
import './themeSettingsSection.css'

type ThemePreviewProps = {
  theme: AppThemeDefinition
}

function ThemePreview({ theme }: ThemePreviewProps) {
  return (
    <span
      aria-hidden="true"
      className={`theme-option__preview theme-option__preview--${theme.id}`}
    >
      <span className="theme-option__preview-bar" />
      <span className="theme-option__preview-body">
        <span className="theme-option__preview-rail" />
        <span className="theme-option__preview-main">
          <span className="theme-option__preview-card theme-option__preview-card--hero" />
          <span className="theme-option__preview-grid">
            <span className="theme-option__preview-card" />
            <span className="theme-option__preview-card" />
            <span className="theme-option__preview-card" />
          </span>
        </span>
      </span>
    </span>
  )
}

export function ThemeSettingsSection() {
  const { setTheme, themeId, themes } = useTheme()

  return (
    <SurfaceCard
      as="section"
      className="settings-section"
      tone="soft"
      aria-labelledby="theme-settings-title"
    >
      <div className="settings-section__header">
        <h2 id="theme-settings-title">Theme</h2>
        <p>Choose how MAGE looks across the app. Changes apply immediately and stay saved on this device.</p>
      </div>

      <div
        aria-label="Theme options"
        className="theme-settings__grid"
        role="radiogroup"
      >
        {themes.map((theme) => {
          const isActive = theme.id === themeId

          return (
            <button
              aria-checked={isActive}
              className="theme-option"
              data-active={isActive}
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              role="radio"
              type="button"
            >
              <ThemePreview theme={theme} />
              <span className="theme-option__copy">
                <strong>{theme.label}</strong>
                <span>{theme.description}</span>
              </span>
              <span className="theme-option__status">{isActive ? 'Active theme' : 'Switch theme'}</span>
            </button>
          )
        })}
      </div>
    </SurfaceCard>
  )
}
