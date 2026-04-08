import type { PropsWithChildren } from 'react'

type AuthPageProps = PropsWithChildren<{
  titleId: string
}>

type AuthPageHeaderProps = {
  description: string
  eyebrow: string
  title: string
  titleId: string
}

export function AuthPage({ children, titleId }: AuthPageProps) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby={titleId}>
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
