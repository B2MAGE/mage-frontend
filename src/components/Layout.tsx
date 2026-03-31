import type { PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const navItems = [
  { label: 'Register', to: '/register' },
  { label: 'Login', to: '/login' },
]

export function Layout({ children }: PropsWithChildren) {
  const { accessToken, isAuthenticated, isRestoringSession, logout, user } = useAuth()

  return (
    <>
      <header className="navbar">
        <div className="nav-inner">
          <Link className="logo" to="/">
            MAGE
          </Link>
          {isAuthenticated && user ? (
            <div className="nav-session">
              <div className="nav-session-copy">
                <strong>{user.displayName}</strong>
                <span>{user.email}</span>
              </div>
              <button className="nav-logout" type="button" onClick={logout}>
                Log out
              </button>
            </div>
          ) : isRestoringSession && accessToken ? (
            <div className="nav-status" aria-live="polite">
              Restoring session...
            </div>
          ) : (
            <nav className="nav-links" aria-label="Primary">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className="app-shell">{children}</div>
    </>
  )
}
