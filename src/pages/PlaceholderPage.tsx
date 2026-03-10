import type { ReactNode } from 'react'

type PlaceholderPageProps = {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  footnote?: string
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  action,
  footnote = 'More platform features are coming soon.',
}: PlaceholderPageProps) {
  return (
    <main className="card">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="sub">{description}</p>
      {action ? (
        <>
          <div className="divider" />
          {action}
        </>
      ) : null}
      <p className="foot">{footnote}</p>
      <div className="brand">MAGE</div>
    </main>
  )
}
