import type { PropsWithChildren } from 'react'

export function Layout({ children }: PropsWithChildren) {
  return (
    <>
      <header className="navbar">
        <div className="nav-inner">
          <div className="logo">MAGE</div>
          <nav className="nav-links" aria-label="Primary">
            <a href="/login">Login</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/presets">Presets</a>
          </nav>
        </div>
      </header>
      <div className="app-shell">{children}</div>
    </>
  )
}
