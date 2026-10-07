import { useLocation } from 'react-router-dom'
import { LoadingRegion, PagePanel, Skeleton } from '@shared/ui'
import { getSettingsSection } from './sections'
import './settings.css'

const SETTINGS_NAV_WIDTHS = ['72%', '55%', '64%']

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="settings-section__header settings-loading__section-header">
      <h2>{title}</h2>
      <Skeleton className="settings-loading__section-copy" shape="line" />
      <Skeleton
        className="settings-loading__section-copy settings-loading__section-copy--short"
        shape="line"
      />
    </div>
  )
}

function FieldSkeleton({ full = false, multiline = false }: { full?: boolean; multiline?: boolean }) {
  return (
    <div
      className={[
        'settings-loading__field',
        full ? 'settings-loading__field--full' : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Skeleton className="settings-loading__field-label" shape="line" />
      <Skeleton
        className={`settings-loading__field-input${multiline ? ' settings-loading__field-input--multiline' : ''}`}
        shape="block"
      />
    </div>
  )
}

function ThemeCardSkeleton() {
  return (
    <div className="settings-loading__theme-card">
      <div className="settings-loading__theme-preview">
        <Skeleton className="settings-loading__theme-preview-bar" shape="block" />
        <div className="settings-loading__theme-preview-body">
          <Skeleton className="settings-loading__theme-preview-rail" shape="block" />
          <div className="settings-loading__theme-preview-main">
            <Skeleton shape="block" />
            <div className="settings-loading__theme-preview-grid">
              <Skeleton shape="block" />
              <Skeleton shape="block" />
              <Skeleton shape="block" />
            </div>
          </div>
        </div>
      </div>
      <div className="settings-loading__theme-details">
        <div className="settings-loading__theme-copy">
          <Skeleton className="settings-loading__theme-name" shape="line" />
          <Skeleton className="settings-loading__theme-description" shape="line" />
        </div>
        <Skeleton className="settings-loading__theme-action" shape="block" />
      </div>
    </div>
  )
}

export function SettingsLoadingState() {
  const activeSection = getSettingsSection(useLocation().hash)

  return (
    <LoadingRegion
      as="main"
      className="ui-page-frame ui-page-frame--form page-stack settings-page settings-page--loading"
      label="Loading account settings"
      visualClassName="settings-loading__visual"
    >
      <header className="settings-page__heading">
        <h1 className="settings-title">Settings</h1>
        <Skeleton className="settings-loading__page-lead" shape="line" />
        <Skeleton
          className="settings-loading__page-lead settings-loading__page-lead--short"
          shape="line"
        />
      </header>

      <div className="settings-layout">
        <aside className="settings-nav">
          <div className="settings-nav__list settings-loading__nav" aria-hidden="true">
            {SETTINGS_NAV_WIDTHS.map((width, index) => (
              <span className="settings-loading__nav-row" key={width}>
                <Skeleton
                  className="settings-loading__nav-line"
                  shape="line"
                  style={{ width }}
                />
                <span className="settings-loading__nav-label">
                  {index === 0 ? 'Appearance' : index === 1 ? 'Profile' : 'Password'}
                </span>
              </span>
            ))}
          </div>
        </aside>

        <div className="settings-content">
          <div className="settings-section-view" hidden={activeSection !== 'appearance'}>
            <PagePanel
              as="section"
              className="settings-section settings-section--appearance settings-loading__section"
            >
            <SectionHeading title="Appearance" />
            <div className="theme-settings__grid settings-loading__theme-grid">
              <ThemeCardSkeleton />
              <ThemeCardSkeleton />
            </div>
            <div className="settings-loading__preference">
              <div className="settings-loading__preference-copy">
                <Skeleton className="settings-loading__preference-title" shape="line" />
                <Skeleton className="settings-loading__preference-description" shape="line" />
              </div>
              <Skeleton className="settings-loading__preference-control" shape="block" />
            </div>
            </PagePanel>
          </div>

          <div className="settings-section-view" hidden={activeSection !== 'profile'}>
            <PagePanel
              as="section"
              className="settings-section settings-section--profile settings-loading__section"
            >
            <SectionHeading title="Profile details" />
            <div className="settings-profile-form settings-loading__profile-form">
              <FieldSkeleton full />
              <div className="settings-loading__identity">
                <Skeleton className="settings-loading__avatar" shape="circle" />
                <div className="settings-loading__identity-copy">
                  <Skeleton className="settings-loading__identity-name" shape="line" />
                  <Skeleton className="settings-loading__identity-handle" shape="line" />
                </div>
              </div>
              <Skeleton className="settings-loading__gradient" shape="block" />
              <FieldSkeleton full />
              <FieldSkeleton full />
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton full multiline />
              <div className="settings-actions settings-loading__actions">
                <Skeleton className="settings-loading__save" shape="block" />
              </div>
            </div>
            </PagePanel>
          </div>

          <div className="settings-section-view" hidden={activeSection !== 'security'}>
            <PagePanel
              as="section"
              className="settings-section settings-section--security settings-loading__section"
            >
            <SectionHeading title="Password" />
            <div className="settings-password-form settings-loading__password-form">
              <Skeleton className="settings-loading__security-note" shape="block" />
              <FieldSkeleton full />
              <FieldSkeleton full />
              <FieldSkeleton full />
              <div className="settings-actions settings-loading__actions">
                <Skeleton className="settings-loading__save" shape="block" />
              </div>
            </div>
            </PagePanel>
          </div>
        </div>
      </div>
    </LoadingRegion>
  )
}
