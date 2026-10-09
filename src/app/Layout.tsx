import { useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '@auth'
import { ModerationMenuLink } from '@modules/moderation'
import { AppIcon, Skeleton, UserAvatar } from '@shared/ui'
import './pulseChrome.css'

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
                  <AppIcon name="plus" />
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
                <UserAvatar className="nav-avatar" initials={profileInitials} gradientStart={user?.avatarGradientStart} gradientEnd={user?.avatarGradientEnd} />
                <span className="nav-profile-trigger__label">{profileName}</span>
                <span className="nav-profile-trigger__chevron" aria-hidden="true">
                  <AppIcon name="chevron-down" />
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
                      to={user.handle ? `/@${user.handle}` : '/settings#profile'}
                    >
                      <UserAvatar className="nav-avatar nav-avatar--large" initials={profileInitials} gradientStart={user?.avatarGradientStart} gradientEnd={user?.avatarGradientEnd} />
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
                      <AppIcon name="images" />
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
                      <AppIcon name="settings" />
                    </span>
                    <span>Settings</span>
                  </Link>

                  <ModerationMenuLink onNavigate={() => setIsAccountMenuOpen(false)} />

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
                      <AppIcon name="log-out" />
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
                  <AppIcon name="user" />
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
