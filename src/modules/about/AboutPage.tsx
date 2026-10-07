import { Link } from 'react-router-dom'
import { useAuth } from '@auth'
import { PageFrame, PagePanel, SectionHeader } from '@shared/ui'
import { AboutScene } from './AboutScene'
import './about.css'

export function AboutPage() {
  const { isAuthenticated } = useAuth()

  return (
    <PageFrame className="about-page" aria-labelledby="about-page-title">
      <PagePanel as="section" className="about-hero" aria-labelledby="about-page-title">
        <div className="about-hero__copy">
          <h1 className="ui-page-title" id="about-page-title">Music you can see.</h1>
          <p className="ui-page-lead">MAGE — Musical Autonomous Generated Environments — is a place to create and discover interactive visual scenes that move with sound.</p>
          <div className="about-hero__actions">
            <Link className="ui-button ui-button--primary" to="/scenes">Explore scenes</Link>
            <Link className="ui-button ui-button--secondary" to={isAuthenticated ? '/create-scene' : '/login'}>
              {isAuthenticated ? 'Create a scene' : 'Sign in'}
            </Link>
          </div>
        </div>
        <AboutScene />
      </PagePanel>

      <section className="about-introduction" aria-labelledby="about-scenes-title">
        <SectionHeader
          description="A scene combines visuals, movement, effects, and audio response into one interactive experience. Creators shape how it looks and reacts, then publish it for other people to explore."
          title="What is a MAGE scene?"
          titleId="about-scenes-title"
        />
        <div className="about-principles">
          <PagePanel as="article" className="about-principle" tone="nested">
            <span aria-hidden="true" className="about-principle__number">01</span>
            <h3>Create</h3>
            <p>Build a scene from shaders, camera settings, motion, and effects.</p>
          </PagePanel>
          <PagePanel as="article" className="about-principle" tone="nested">
            <span aria-hidden="true" className="about-principle__number">02</span>
            <h3>React</h3>
            <p>Use sound and interaction as inputs that change the visual experience.</p>
          </PagePanel>
          <PagePanel as="article" className="about-principle" tone="nested">
            <span aria-hidden="true" className="about-principle__number">03</span>
            <h3>Share</h3>
            <p>Publish scenes, discover other creators, and experience their work with your own audio.</p>
          </PagePanel>
        </div>
      </section>

      <PagePanel as="section" className="about-callout" tone="quiet" aria-labelledby="about-explore-title">
        <div>
          <p className="ui-eyebrow">Start exploring</p>
          <h2 id="about-explore-title">See what people are making.</h2>
          <p>Browse community scenes or open the studio and create your own.</p>
        </div>
        <Link className="ui-button ui-button--primary" to="/scenes">Explore MAGE</Link>
      </PagePanel>
    </PageFrame>
  )
}
