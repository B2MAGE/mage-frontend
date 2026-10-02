import { LoadingRegion, Skeleton } from '@shared/ui'
import './auth.css'

type AuthFormLoadingStateProps = {
  label: string
  variant?: 'login' | 'recovery' | 'register'
}

function AuthLoadingField() {
  return (
    <div className="auth-loading__field">
      <Skeleton className="auth-loading__label" shape="line" />
      <Skeleton className="auth-loading__input" shape="block" />
    </div>
  )
}

function AuthDisplayPreviewLoadingState() {
  return (
    <div className="auth-loading__display-preview">
      <Skeleton className="auth-loading__display-avatar" shape="circle" />
      <div className="auth-loading__display-copy">
        <Skeleton className="auth-loading__display-name" shape="line" />
        <Skeleton className="auth-loading__display-hint" shape="line" />
      </div>
    </div>
  )
}

export function AuthFormLoadingState({
  label,
  variant = 'login',
}: AuthFormLoadingStateProps) {
  const fieldCount = variant === 'register' ? 3 : variant === 'recovery' ? 1 : 2

  return (
    <LoadingRegion
      as="main"
      className={`auth-page auth-page--loading${variant === 'register' ? ' auth-page--registration' : ''}`}
      label={label}
    >
      <section className="surface surface--form">
        <div className="auth-loading__header">
          <Skeleton className="auth-loading__title" shape="line" />
          <Skeleton className="auth-loading__copy auth-loading__copy--long" shape="line" />
          <Skeleton className="auth-loading__copy" shape="line" />
        </div>

        <div className="auth-form auth-loading__form">
          {variant === 'register' ? (
            <div className="auth-name-grid">
              <AuthLoadingField />
              <AuthLoadingField />
            </div>
          ) : null}
          {variant === 'register' ? (
            <>
              <AuthLoadingField />
              <AuthDisplayPreviewLoadingState />
              <AuthLoadingField />
              <AuthLoadingField />
              <AuthLoadingField />
            </>
          ) : (
            Array.from({ length: fieldCount }, (_, index) => (
              <AuthLoadingField key={index} />
            ))
          )}
          <Skeleton className="auth-loading__submit" shape="block" />
        </div>

        <div className="auth-divider" />
        <Skeleton className="auth-loading__footnote" shape="line" />
      </section>
    </LoadingRegion>
  )
}
