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

function ChannelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 12.3a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Zm0 2c-3.8 0-6.8 2-6.8 4.5 0 .4.3.7.7.7h12.2c.4 0 .7-.3.7-.7 0-2.5-3-4.5-6.8-4.5Z"
        fill="currentColor"
      />
      <path
        d="M4.8 3.8h14.4A1.8 1.8 0 0 1 21 5.6v12.8a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.4V5.6a1.8 1.8 0 0 1 1.8-1.8Zm0 1.5a.3.3 0 0 0-.3.3v12.8c0 .2.1.3.3.3h14.4c.2 0 .3-.1.3-.3V5.6a.3.3 0 0 0-.3-.3H4.8Z"
        fill="currentColor"
      />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 4.4a1.5 1.5 0 0 1 1 .4l6.2 5.6a1 1 0 1 1-1.4 1.5L17 11.2v6.3a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 17.5v-6.3l-.8.7a1 1 0 0 1-1.4-1.5L11 4.8a1.5 1.5 0 0 1 1-.4Zm-3 5.5v7.1h6v-7.1l-3-2.7-3 2.7Z"
        fill="currentColor"
      />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M14.6 7.4a1 1 0 0 1 1.4 0l3.9 3.9a1 1 0 0 1 0 1.4L16 16.6a1 1 0 1 1-1.4-1.4l2.2-2.2H9a1 1 0 1 1 0-2h7.8l-2.2-2.2a1 1 0 0 1 0-1.4Z"
        fill="currentColor"
      />
      <path
        d="M5 4.5h6.2a1 1 0 1 1 0 2H6.5v11h4.7a1 1 0 1 1 0 2H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"
        fill="currentColor"
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
              <Link className="nav-create" to="/create-preset">
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
                    <span className="nav-avatar nav-avatar--large" aria-hidden="true">
                      {profileInitials}
                    </span>
                    <div className="nav-menu__identity">
                      <strong>{profileName}</strong>
                      <span>{profileEmail}</span>
                    </div>
                  </div>

                  <div className="nav-menu__divider" />

                  <Link
                    className="nav-menu__item"
                    onClick={() => setIsAccountMenuOpen(false)}
                    role="menuitem"
                    to="/"
                  >
                    <span className="nav-menu__icon">
                      <HomeIcon />
                    </span>
                    <span>Home</span>
                  </Link>

                  <Link
                    className="nav-menu__item"
                    onClick={() => setIsAccountMenuOpen(false)}
                    role="menuitem"
                    to="/my-presets"
                  >
                    <span className="nav-menu__icon">
                      <ChannelIcon />
                    </span>
                    <span>My Channel</span>
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
