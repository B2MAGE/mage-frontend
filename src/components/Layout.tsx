import type { PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Register', to: '/register' },
  { label: 'Login', to: '/login' },
]

export function Layout({ children }: PropsWithChildren) {
  return (
    <>
      <header className="navbar">
        <div className="nav-inner">
          <Link className="logo" to="/">
            MAGE
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="app-shell">{children}</div>
    </>
  )
}
