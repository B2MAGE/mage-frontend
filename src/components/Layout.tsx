import type { PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const guestNavItems = [
  { label: 'Register', to: '/register' },
  { label: 'Login', to: '/login' },
]

const authenticatedNavItems = [
  { label: 'Home', to: '/' },
  { label: 'My Presets', to: '/my-presets' },
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
            <div className="nav-auth">
              <nav className="nav-links" aria-label="Primary">
                {authenticatedNavItems.map((item) => (
                  <NavLink key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="nav-session">
                <div className="nav-session-copy">
                  <strong>{user.displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <button className="nav-logout" type="button" onClick={logout}>
                  Log out
                </button>
              </div>
            </div>
          ) : isRestoringSession && accessToken ? (
            <div className="nav-status" aria-live="polite">
              Restoring session...
            </div>
          ) : (
            <nav className="nav-links" aria-label="Primary">
              {guestNavItems.map((item) => (
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
