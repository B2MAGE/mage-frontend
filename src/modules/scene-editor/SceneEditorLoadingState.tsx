import { LoadingRegion, Skeleton } from '@shared/ui'
import './scene-editor-pulse.css'

const EDITOR_STEP_COUNT = 7

type SceneEditorLoadingStateProps = {
  label?: string
}

export function SceneEditorLoadingState({
  label = 'Loading scene editor',
}: SceneEditorLoadingStateProps) {
  return (
    <LoadingRegion
      as="main"
      className="auth-page auth-page--wide scene-editor-page scene-editor-loading"
      label={label}
    >
      <section aria-hidden="true" className="surface surface--form surface--editor">
        <div className="auth-header scene-editor-loading__header">
          <Skeleton className="scene-editor-loading__title" shape="line" />
          <Skeleton className="scene-editor-loading__description" shape="line" />
        </div>

        <div className="scene-editor-form">
          <div className="scene-editor-layout">
            <aside className="scene-editor-stepper-rail scene-editor-loading__rail">
              <Skeleton className="scene-editor-loading__rail-label" shape="line" />
              <div className="scene-editor-loading__steps">
                {Array.from({ length: EDITOR_STEP_COUNT }, (_, index) => (
                  <div className="scene-editor-loading__step" key={index}>
                    <Skeleton className="scene-editor-loading__step-number" shape="circle" />
                    <Skeleton className="scene-editor-loading__step-label" shape="line" />
                  </div>
                ))}
              </div>
            </aside>

            <div className="scene-editor-main scene-editor-loading__main">
              <div className="scene-editor-loading__section-heading">
                <Skeleton className="scene-editor-loading__eyebrow" shape="line" />
                <Skeleton className="scene-editor-loading__section-title" shape="line" />
                <Skeleton className="scene-editor-loading__section-copy" shape="line" />
              </div>

              <div className="scene-editor-loading__fields">
                <div className="scene-editor-loading__field">
                  <Skeleton className="scene-editor-loading__field-label" shape="line" />
                  <Skeleton className="scene-editor-loading__input" shape="block" />
                  <Skeleton className="scene-editor-loading__hint" shape="line" />
                </div>
                <div className="scene-editor-loading__field">
                  <Skeleton className="scene-editor-loading__field-label" shape="line" />
                  <Skeleton className="scene-editor-loading__textarea" shape="block" />
                </div>
                <div className="scene-editor-loading__field scene-editor-loading__field--compact">
                  <Skeleton className="scene-editor-loading__field-label" shape="line" />
                  <Skeleton className="scene-editor-loading__input" shape="block" />
                </div>
              </div>

              <div className="scene-editor-loading__action-bar">
                <Skeleton className="scene-editor-loading__secondary-action" shape="block" />
                <Skeleton className="scene-editor-loading__primary-action" shape="block" />
              </div>
            </div>

            <aside className="scene-editor-preview scene-editor-loading__preview">
              <section className="surface surface--soft scene-editor-preview__card">
                <div className="scene-editor-preview__header scene-editor-loading__preview-header">
                  <div>
                    <Skeleton className="scene-editor-loading__preview-eyebrow" shape="line" />
                    <Skeleton className="scene-editor-loading__preview-title" shape="line" />
                  </div>
                </div>
                <div className="scene-editor-preview__content scene-editor-loading__preview-content">
                  <Skeleton className="scene-editor-loading__viewport" shape="block" />
                  <div className="scene-editor-loading__player-controls">
                    <Skeleton className="scene-editor-loading__control" shape="circle" />
                    <Skeleton className="scene-editor-loading__timeline" shape="line" />
                    <Skeleton className="scene-editor-loading__control" shape="circle" />
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </LoadingRegion>
  )
}
