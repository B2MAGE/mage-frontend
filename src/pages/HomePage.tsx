import { useAuth } from '../auth/AuthContext'
import { MagePlayer } from '../components/MagePlayer'
import type { MageSceneBlob } from '../lib/magePlayerAdapter'
import { ScenesPage } from './ScenesPage'

const HOME_PAGE_SCENE = {
  visualizer: {
    shader: `
      let size = input()
      let pointerDown = input()
      time = 0.3 * time
      size *= 1.3
      rotateY(mouse.x * -PI * (1.0 + nsin(time)))
      rotateX(mouse.y * PI * (1.0 + nsin(time)))
      metal(0.5 * size)
      let rayDir = normalize(getRayDirection())
      let clampedColor = vec3(rayDir.x + 0.2, rayDir.y + 0.25, rayDir.z + 0.2)
      color(clampedColor)
      rotateY(sin(getRayDirection().y * 8.0 * ncos(sin(time)) + size))
      rotateX(cos(getRayDirection().x * 16.0 * nsin(time) + size))
      rotateZ(ncos(getRayDirection().z * 4.0 * cos(time) + size))
      boxFrame(vec3(size), size * 0.1)
      shine(0.8 * size)
      blend(nsin(time * size) * 0.1 + 0.1)
      sphere(size / 2.0 - pointerDown * 0.3)
      blend(ncos(time * size) * 0.1 + 0.1)
      boxFrame(vec3(size - 0.075 * pointerDown), size)
    `,
    skyboxPreset: 6,
    scale: 10,
  },
  intent: {
    time_multiplier: 1,
    minimizing_factor: 0.8,
    power_factor: 8,
    pointerDownMultiplier: 0,
    base_speed: 0.2,
    easing_speed: 0.6,
    camTilt: 0,
    autoRotate: true,
    autoRotateSpeed: 0.2,
    fov: 75,
  },
} satisfies MageSceneBlob

export function HomePage() {
  const { accessToken, isAuthenticated, isRestoringSession } = useAuth()

  if (isAuthenticated) {
    return <ScenesPage />
  }

  if (isRestoringSession && accessToken) {
    return (
      <main className="surface surface--hero home-hero">
        <div className="eyebrow">Scenes</div>
        <h1>Loading scenes...</h1>
        <p className="page-lead">MAGE is restoring your account before opening scene discovery.</p>
      </main>
    )
  }

  return (
    <main className="surface surface--hero home-hero">
      <div className="eyebrow">Preview</div>
      <h1>MAGE</h1>
      <p className="page-lead">Musical Autonomous Generated Environments</p>
      <section className="home-preview-section" aria-label="Live scene preview">
        <MagePlayer
          ariaLabel="MAGE live scene preview"
          initialPlayback="playing"
          sceneBlob={HOME_PAGE_SCENE}
        />
      </section>
      <p className="page-footnote">The full platform experience is currently in development.</p>
      <div className="page-mark">MAGE</div>
    </main>
  )
}
