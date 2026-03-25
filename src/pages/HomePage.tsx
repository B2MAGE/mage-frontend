import { Link } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="In Development"
      title="MAGE is taking shape."
      description="The full platform is on the way. For now, you can explore the local engine lab inside this frontend."
      action={
        <Link className="demo-link" to="/lab">
          Open MAGE Lab
        </Link>
      }
      footnote="The lab route is meant for local experimentation while the product shell is still taking shape."
    />
  )
}
