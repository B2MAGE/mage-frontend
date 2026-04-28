import type { PropsWithChildren } from 'react'

type AuthPageProps = PropsWithChildren<{
  cardClassName?: string
  className?: string
  titleId: string
}>

type AuthPageHeaderProps = {
  description: string
  eyebrow: string
  title: string
  titleId: string
}

function buildClassName(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

export function AuthPage({ cardClassName, children, className, titleId }: AuthPageProps) {
  return (
    <main className={buildClassName('auth-page', className)}>
      <section
        aria-labelledby={titleId}
        className={buildClassName('surface surface--form', cardClassName)}
      >
        {children}
      </section>
    </main>
  )
}

export function AuthPageHeader({
  description,
  eyebrow,
  title,
  titleId,
}: AuthPageHeaderProps) {
  return (
    <div className="auth-header">
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="auth-title" id={titleId}>
        {title}
      </h1>
      <p className="auth-copy">{description}</p>
    </div>
  )
}
