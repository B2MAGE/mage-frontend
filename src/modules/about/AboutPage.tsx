import { Link } from 'react-router-dom'
import { useAuth } from '@auth'
import { AboutScene } from './AboutScene'
import '@shared/ui/actionLinks.css'
import './about.css'

export function AboutPage() {
  const { isAuthenticated } = useAuth()

  return (
    <main className="about-page" aria-labelledby="about-page-title">
      <section className="about-hero" aria-labelledby="about-page-title">
        <div className="about-hero__copy">
          <h1 id="about-page-title">Music you <br />can see.</h1>
          <p>MAGE — Musical Autonomous Generated Environments — is a place to create and discover interactive visual scenes that move with sound.</p>
          <div className="about-hero__actions">
            <Link className="primary-button" to="/scenes">Explore scenes</Link>
            <Link className="secondary-button" to={isAuthenticated ? '/create-scene' : '/login'}>
              {isAuthenticated ? 'Create a scene' : 'Sign in'}
            </Link>
          </div>
        </div>
        <AboutScene />
      </section>

      <section className="about-introduction" aria-labelledby="about-scenes-title">
        <h2 id="about-scenes-title">What is a MAGE scene?</h2>
        <p>A scene combines visuals, movement, effects, and audio response into one interactive experience. Creators shape how it looks and reacts, then publish it for other people to explore.</p>
        <div className="about-principles">
          <article>
            <h3>Create</h3>
            <p>Build a scene from shaders, camera settings, motion, and effects.</p>
          </article>
          <article>
            <h3>React</h3>
            <p>Use sound and interaction as inputs that change the visual experience.</p>
          </article>
          <article>
            <h3>Share</h3>
            <p>Publish scenes, discover other creators, and experience their work with your own audio.</p>
          </article>
        </div>
      </section>

      <section className="about-callout" aria-labelledby="about-explore-title">
        <div>
          <h2 id="about-explore-title">See what people are making.</h2>
          <p>Browse community scenes or open the studio and create your own.</p>
        </div>
        <Link className="primary-button" to="/scenes">Explore MAGE</Link>
      </section>
    </main>
  )
}
