import { Link, Navigate, useParams } from 'react-router-dom'
import { PlaceholderPage } from './PlaceholderPage'

export function PresetDetailPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) {
    return <Navigate replace to="/my-presets" />
  }

  return (
    <PlaceholderPage
      eyebrow="Preset Detail"
      title={`Preset ${id}`}
      description="This preset detail route is ready for the next preset experience."
      action={
        <div className="auth-actions">
          <Link className="demo-link" to="/my-presets">
            Back to My Presets
          </Link>
        </div>
      }
      footnote="Preset selection now routes correctly from the My Presets page."
    />
  )
}
