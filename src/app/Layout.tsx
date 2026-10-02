import { useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@auth'
import { Skeleton, UserAvatar } from '@shared/ui'
import './pulseChrome.css'

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 2.1c-4.5 0-8.1 2.4-8.1 5.3 0 .3.2.5.5.5h15.2c.3 0 .5-.2.5-.5 0-2.9-3.6-5.3-8.1-5.3Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CreateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 4.5a1 1 0 0 1 1 1v5.5h5.5a1 1 0 1 1 0 2H13V18.5a1 1 0 1 1-2 0V13H5.5a1 1 0 1 1 0-2H11V5.5a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M6.7 9.3a1 1 0 0 1 1.4 0l3.9 3.9 3.9-3.9a1 1 0 1 1 1.4 1.4l-4.6 4.6a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ScenesIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M4.75 6.5A1.75 1.75 0 0 1 6.5 4.75h11A1.75 1.75 0 0 1 19.25 6.5v11a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 4.75 17.5z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M7.5 15.45 10.2 12.3a.6.6 0 0 1 .92 0l1.7 2.05a.6.6 0 0 0 .93.02l1.6-1.82a.6.6 0 0 1 .91.02L17.5 14.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path d="M8.95 9.25a1.05 1.05 0 1 0 0-.001" fill="currentColor" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M13.5 7.5 18 12l-4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M17.75 12H9.25M10.75 4.75H6.5a1.75 1.75 0 0 0-1.75 1.75v11A1.75 1.75 0 0 0 6.5 19.25h4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function getProfileInitials(displayName: string, email: string) {
  const source = displayName.trim() || email.trim()

  if (!source) {
    return 'MG'
  }

  const words = source.split(/\s+/).filter(Boolean)

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}

export function Layout({ children }: PropsWithChildren) {
  const { accessToken, isAuthenticated, isRestoringSession, logout, user } = useAuth()
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const accountMenuId = useId()
  const accountMenuTriggerId = useId()
  const profileName = user?.displayName?.trim() || user?.email?.trim() || 'MAGE User'
  const profileEmail = user?.email?.trim() || ''
  const profileInitials = useMemo(
    () => getProfileInitials(user?.displayName ?? '', user?.email ?? ''),
    [user?.displayName, user?.email],
  )

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  return (
    <>
      <header className="navbar">
        <div className="nav-inner">
          <Link className="logo" to="/">
            <span className="pulse-orbit" aria-hidden="true"><span className="pulse-orbit-core" /></span><span className="logo__wordmark">MAGE</span>
          </Link>
          <nav className="nav-primary" aria-label="Primary navigation">
            <NavLink
              className={({ isActive }) =>
                `nav-primary__link${isActive ? ' nav-primary__link--active' : ''}`
              }
              to="/scenes"
            >
              Explore
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                `nav-primary__link${isActive ? ' nav-primary__link--active' : ''}`
              }
              to="/about"
            >
              About
            </NavLink>
          </nav>
          {isAuthenticated && user ? (
            <div className="nav-actions" ref={accountMenuRef}>
              <Link className="nav-create" to="/create-scene">
                <span className="nav-create__icon" aria-hidden="true">
                  <CreateIcon />
                </span>
                <span>Create</span>
              </Link>
              <button
                aria-controls={isAccountMenuOpen ? accountMenuId : undefined}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                aria-label={`Open account menu for ${profileName}`}
                className="nav-profile-trigger"
                id={accountMenuTriggerId}
                onClick={() => setIsAccountMenuOpen((currentValue) => !currentValue)}
                type="button"
              >
                <UserAvatar className="nav-avatar" initials={profileInitials} />
                <span className="nav-profile-trigger__label">{profileName}</span>
                <span className="nav-profile-trigger__chevron" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </button>

              {isAccountMenuOpen ? (
                <div
                  aria-labelledby={accountMenuTriggerId}
                  className="nav-menu"
                  id={accountMenuId}
                  role="menu"
                >
                  <div className="nav-menu__header">
                    <Link
                      className="nav-menu__profile-link"
                      onClick={() => setIsAccountMenuOpen(false)}
                      role="menuitem"
                      to={user.handle ? `/@${user.handle}` : '/profile'}
                    >
                      <UserAvatar className="nav-avatar nav-avatar--large" initials={profileInitials} />
                      <div className="nav-menu__identity">
                        <strong>{profileName}</strong>
                        <span className="nav-menu__identity-email" title={profileEmail}>
                          {profileEmail}
                        </span>
                      </div>
                      <span className="nav-menu__channel-link">
                        View profile
                      </span>
                    </Link>
                  </div>

                  <div className="nav-menu__divider" />


                  <Link
                    className="nav-menu__item"
                    onClick={() => setIsAccountMenuOpen(false)}
                    role="menuitem"
                    to="/my-scenes"
                  >
                    <span className="nav-menu__icon">
                      <ScenesIcon />
                    </span>
                    <span>My Scenes</span>
                  </Link>

                  <Link
                    className="nav-menu__item"
                    onClick={() => setIsAccountMenuOpen(false)}
                    role="menuitem"
                    to="/settings"
                  >
                    <span className="nav-menu__icon">
                      <SettingsIcon />
                    </span>
                    <span>Settings</span>
                  </Link>

                  <button
                    className="nav-menu__item nav-menu__item--button"
                    onClick={() => {
                      setIsAccountMenuOpen(false)
                      logout()
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="nav-menu__icon">
                      <SignOutIcon />
                    </span>
                    <span>Sign out</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : isRestoringSession && accessToken ? (
            <div aria-hidden="true" className="nav-actions nav-session-placeholder">
              <Skeleton className="nav-session-placeholder__create" shape="block" />
              <div className="nav-session-placeholder__profile">
                <Skeleton className="nav-session-placeholder__avatar" shape="circle" />
                <Skeleton className="nav-session-placeholder__name" shape="line" />
              </div>
            </div>
          ) : (
            <div className="nav-actions">
              <Link className="nav-signin" to="/login">
                <span className="nav-signin__icon" aria-hidden="true">
                  <UserIcon />
                </span>
                <span>Sign in</span>
              </Link>
            </div>
          )}
        </div>
      </header>
      <div className="app-shell">{children}</div>
      <footer className="pulse-footer">
        <div className="pulse-footer__inner">
          <div className="pulse-footer__brand">
            <strong>MAGE</strong>
            <span>Musical Autonomous Generated Environments</span>
          </div>
          <nav aria-label="Footer navigation" className="pulse-footer__nav">
            <Link to="/">Home</Link>
            <Link to="/scenes">Explore</Link>
            <Link to="/about">About</Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
