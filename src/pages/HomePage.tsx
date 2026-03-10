import { PlaceholderPage } from './PlaceholderPage'

export function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="In Development"
      title="MAGE is taking shape."
      description="The full platform is on the way. For now, you can explore the live rendering demo."
      action={
        <a
          className="demo-link"
          href="https://bsiscoe.github.io/MAGE/"
          target="_blank"
          rel="noreferrer"
        >
          View Live Demo
        </a>
      }
    />
  )
}
