import { Link } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="In Development"
      title="MAGE is taking shape."
      description="The full platform is on the way. The registration flow is the first real account experience now taking shape."
      action={
        <Link className="demo-link" to="/register">
          Create an Account
        </Link>
      }
    />
  )
}
