import { useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

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
      <path
        d="M8.95 9.25a1.05 1.05 0 1 0 0-.001"
        fill="currentColor"
      />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5Z"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <path
        stroke="currentColor"
        d="M12 5.95c1.5 1.43 2.35 3.62 2.35 6.05 0 2.42-.85 4.62-2.35 6.05M12 5.95c-1.5 1.43-2.35 3.62-2.35 6.05 0 2.42.85 4.62 2.35 6.05M5.9 12h12.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
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
            MAGE
          </Link>
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
                <span className="nav-avatar" aria-hidden="true">
                  {profileInitials}
                </span>
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
                      to="/settings"
                    >
                      <span className="nav-avatar nav-avatar--large" aria-hidden="true">
                        {profileInitials}
                      </span>
                      <div className="nav-menu__identity">
                        <strong>{profileName}</strong>
                        <span className="nav-menu__identity-email" title={profileEmail}>
                          {profileEmail}
                        </span>
                        <button className="nav-menu__channel-link" type="button">
                          View your channel
                        </button>
                      </div>
                    </Link>
                  </div>

                  <div className="nav-menu__divider" />

                  <Link
                    className="nav-menu__item"
                    onClick={() => setIsAccountMenuOpen(false)}
                    role="menuitem"
                    to="/"
                  >
                    <span className="nav-menu__icon">
                      <BrowseIcon />
                    </span>
                    <span>Browse</span>
                  </Link>

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
            <div className="nav-status-pill" aria-live="polite">
              Restoring session...
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
    </>
  )
}
