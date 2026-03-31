import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PlaceholderPage } from './PlaceholderPage'

export function HomePage() {
  const { accessToken, isAuthenticated, isRestoringSession, user } = useAuth()

  if (isAuthenticated && user) {
    return (
      <PlaceholderPage
        eyebrow="Authenticated"
        title={`Welcome back, ${user.displayName}.`}
        description={`Your shared MAGE session is active for ${user.email}. Protected requests can now reuse the stored bearer token.`}
        footnote="Use Log out in the header to clear the stored auth session."
      />
    )
  }

  if (isRestoringSession && accessToken) {
    return (
      <PlaceholderPage
        eyebrow="Restoring Session"
        title="Checking your saved login."
        description="MAGE is verifying the stored access token with the backend before restoring the authenticated session."
        footnote="If the token is invalid or expired, the app will clear it and return to the signed-out state."
      />
    )
  }

  return (
    <PlaceholderPage
      eyebrow="In Development"
      title="MAGE is taking shape."
      description="The full platform is on the way. Registration, login, and shared auth-session handling are now taking shape."
      action={
        <div className="home-actions">
          <Link className="demo-link" to="/login">
            Sign In
          </Link>
          <Link className="secondary-link home-secondary-link" to="/register">
            Create an Account
          </Link>
        </div>
      }
    />
  )
}
