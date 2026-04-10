import { useMemo, useState, type PropsWithChildren } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const guestNavItems = [
  { label: 'Register', to: '/register' },
  { label: 'Login', to: '/login' },
]

const authenticatedNavItems = [
  { label: 'Home', to: '/' },
  { label: 'My Presets', to: '/my-presets' },
]

function splitDisplayName(displayName: string) {
  const trimmedDisplayName = displayName.trim()

  if (!trimmedDisplayName) {
    return { firstName: '', lastName: '' }
  }

  const [firstName = '', ...remainingParts] = trimmedDisplayName.split(/\s+/)

  return {
    firstName,
    lastName: remainingParts.join(' '),
  }
}

export function Layout({ children }: PropsWithChildren) {
  const { accessToken, isAuthenticated, isRestoringSession, logout, user } = useAuth()
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false)
  const navigate = useNavigate()

  const accountFields = useMemo(() => {
    if (!user) {
      return { firstName: '', lastName: '' }
    }

    return splitDisplayName(user.displayName)
  }, [user])

  function handleLogout() {
    setIsAccountPanelOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

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
                <button
                  className="nav-account-toggle"
                  type="button"
                  aria-expanded={isAccountPanelOpen}
                  aria-controls="account-panel"
                  onClick={() => setIsAccountPanelOpen((currentValue) => !currentValue)}
                >
                  Account
                </button>
                {isAccountPanelOpen ? (
                  <div className="account-panel" id="account-panel">
                    <div className="account-panel-header">
                      <strong>My Account</strong>
                      <span>{user.email}</span>
                    </div>
                    <div className="account-panel-fields">
                      <div className="account-field">
                        <label htmlFor="account-first-name">First name</label>
                        <input
                          id="account-first-name"
                          name="firstName"
                          type="text"
                          defaultValue={accountFields.firstName}
                          placeholder="First name"
                        />
                      </div>
                      <div className="account-field">
                        <label htmlFor="account-last-name">Last name</label>
                        <input
                          id="account-last-name"
                          name="lastName"
                          type="text"
                          defaultValue={accountFields.lastName}
                          placeholder="Last name"
                        />
                      </div>
                    </div>
                    <div className="account-panel-actions">
                      <button className="account-action" type="button">
                        Reset password
                      </button>
                      <button className="nav-logout" type="button" onClick={handleLogout}>
                        Log out
                      </button>
                    </div>
                  </div>
                ) : null}
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
