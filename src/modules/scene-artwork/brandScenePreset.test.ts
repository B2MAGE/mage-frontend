import { describe, expect, it } from 'vitest'
import { BRAND_SCENE } from './brandScenePreset'

type Ring = { radius: number; thickness: number }

// Execute only our checked-in shader with a small DSL harness. getSpace supplies
// a point in the rings' already-rotated local plane; no WebGL engine is needed.
const runShader = new Function(
  'time', 'PI', 'input', 'min', 'max', 'sin', 'atan', 'setMaxIterations',
  'setStepSize', 'noLighting', 'reset', 'rotateX', 'getSpace', 'color', 'torus', 'sphere',
  (BRAND_SCENE.visualizer as { shader: string }).shader,
) as (...bindings: unknown[]) => void

function sampleShader(time: number, size: number, angle: number) {
  const rings: Ring[] = []
  let coreRadius = 0
  let inputIndex = 0
  const noop = () => undefined
  runShader(
    time, Math.PI, () => inputIndex++ === 0 ? size : 0,
    Math.min, Math.max, Math.sin, Math.atan2, noop, noop, noop, noop, noop,
    () => ({ x: Math.cos(angle), y: 0, z: Math.sin(angle) }), noop,
    (radius: number, thickness: number) => rings.push({ radius, thickness }),
    (radius: number) => { coreRadius = radius },
  )
  return { rings, coreRadius }
}

function sampleContours(time: number, size: number) {
  const contours: number[][] = [[], [], []]
  for (let sample = 0; sample < 128; sample += 1) {
    const { rings } = sampleShader(time, size, sample * Math.PI * 2 / 128)
    rings.forEach((ring, index) => contours[index].push(ring.radius))
  }
  return contours
}

function normalizeContour(contour: number[]) {
  const mean = contour.reduce((sum, radius) => sum + radius, 0) / contour.length
  const centered = contour.map((radius) => radius - mean)
  const magnitude = Math.sqrt(centered.reduce((sum, radius) => sum + radius * radius, 0))
  return centered.map((radius) => radius / magnitude)
}

describe('Brand scene preset', () => {
  it('keeps the camera centered and disables camera rotation', () => {
    expect(BRAND_SCENE.controls).toMatchObject({
      target0: { x: 0, y: 0, z: 0 },
      position0: { x: 0, y: 0, z: 4.6 },
    })
    expect(BRAND_SCENE.intent).toMatchObject({
      autoRotate: false,
      autoRotateSpeed: 0,
      camOrientationSpeed: 0,
      camTilt: 0,
    })
  })

  it('keeps all three rings front-facing while retaining gentle time-based breathing', () => {
    const shader = (BRAND_SCENE.visualizer as { shader: string }).shader
    const rotations = Array.from(shader.matchAll(/\brotate[XYZ]\(([^;]*)\);/g), ([, angle]) => angle.trim())

    expect(rotations).toEqual(['PI / 2', 'PI / 2', 'PI / 2'])
    expect(shader).not.toMatch(/\brotate[YZ]\(/)
    expect(shader.match(/\btorus\(/g)).toHaveLength(3)
    expect(shader).toMatch(/\bsin\(\s*time\s*\*/)
  })

  it('breathes proportionately by 3.5 percent over roughly seven real-time seconds without audio', () => {
    const { time_multiplier: timeMultiplier } = BRAND_SCENE.intent as { time_multiplier: number }
    const realCycleSeconds = 2 * Math.PI / (2.25 * timeMultiplier)
    expect(timeMultiplier).toBe(0.4)
    expect(realCycleSeconds).toBeGreaterThan(6.9)
    expect(realCycleSeconds).toBeLessThan(7.1)

    const baseline = sampleShader(0, 0, 0)
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const baselineMeans = sampleContours(0, 0).map(mean)
    for (const [phase, expectedScale] of [[0, 1], [0.25, 1.035], [0.5, 1], [0.75, 0.965], [1, 1]]) {
      const engineTime = realCycleSeconds * phase * timeMultiplier
      const quiet = sampleShader(engineTime, 0, 0)
      const contourMeans = sampleContours(engineTime, 0).map(mean)
      expect(quiet.coreRadius / baseline.coreRadius).toBeCloseTo(expectedScale, 6)
      quiet.rings.forEach((ring, index) => {
        expect(ring.thickness / baseline.rings[index].thickness).toBeCloseTo(expectedScale, 6)
        // Averaging a complete contour removes its independent angular warp;
        // drift keeps running normally, rather than being frozen for this test.
        expect(contourMeans[index] / baselineMeans[index]).toBeCloseTo(expectedScale, 6)
      })
    }
  })

  it('preserves independent partial and peak beat responses throughout the breathing cycle', () => {
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const baselineQuiet = sampleShader(0, 0, 0)
    const baselineQuietMeans = sampleContours(0, 0).map(mean)
    for (const size of [0.13, 1]) {
      const baselineBeat = sampleShader(0, size, 0)
      const baselineBeatMeans = sampleContours(0, size).map(mean)
      for (const phase of [0.125, 0.25, 0.5, 0.75, 1]) {
        const engineTime = phase * 2 * Math.PI / 2.25
        const quiet = sampleShader(engineTime, 0, 0)
        const beat = sampleShader(engineTime, size, 0)
        const scale = quiet.coreRadius / baselineQuiet.coreRadius
        const quietMeans = sampleContours(engineTime, 0).map(mean)
        const beatMeans = sampleContours(engineTime, size).map(mean)

        expect((beat.coreRadius - quiet.coreRadius) / scale).toBeCloseTo(baselineBeat.coreRadius - baselineQuiet.coreRadius, 6)
        beat.rings.forEach((ring, index) => {
          expect((ring.thickness - quiet.rings[index].thickness) / scale).toBeCloseTo(baselineBeat.rings[index].thickness - baselineQuiet.rings[index].thickness, 6)
          expect((beatMeans[index] - quietMeans[index]) / scale).toBeCloseTo(baselineBeatMeans[index] - baselineQuietMeans[index], 6)
        })
      }
    }
  })

  it('deforms each actual ring contour more strongly on the beat instead of uniformly scaling circles', () => {
    for (const time of [0, 3, 12, 41, 100]) {
      const quiet = sampleContours(time, 0)
      const beat = sampleContours(time, 1)
      for (let ring = 0; ring < 3; ring += 1) {
        const quietVariation = Math.max(...quiet[ring]) - Math.min(...quiet[ring])
        const beatVariation = Math.max(...beat[ring]) - Math.min(...beat[ring])
        expect(quietVariation).toBeGreaterThan(0.01)
        expect(beatVariation).toBeGreaterThan(quietVariation * 3)
      }

      // Removing average radius and amplitude catches contours that are only
      // enlarged copies of the same shape, including inverted copies.
      const contours = beat.map(normalizeContour)
      for (const [first, second] of [[0, 1], [0, 2], [1, 2]]) {
        const correlation = contours[first].reduce((sum, radius, index) => sum + radius * contours[second][index], 0)
        expect(Math.abs(correlation)).toBeLessThan(0.95)
      }
    }
  })

  it('uses thinner ring outlines without changing the center circle size or its beat response', () => {
    const quiet = sampleShader(0, 0, 0)
    const peak = sampleShader(0, 1, 0)
    const quietThicknesses = [0.014, 0.013, 0.011]
    const peakThicknesses = [0.019, 0.017, 0.014]

    quiet.rings.forEach((ring, index) => {
      expect(ring.thickness).toBeCloseTo(quietThicknesses[index], 6)
      expect(peak.rings[index].thickness).toBeCloseTo(peakThicknesses[index], 6)
    })
    expect(quiet.coreRadius).toBeCloseTo(0.14, 6)
    expect(peak.coreRadius).toBeCloseTo(0.21, 6)
  })

  it('keeps sampled contours separated and inside the camera throughout quiet, partial, and peak beats', () => {
    const minimumRingGaps = [Infinity, Infinity]
    let minimumCoreGap = Infinity
    let largestOuterRadius = 0
    let finiteGeometry = true
    let minimumThickness = Infinity
    const times = [...Array.from({ length: 121 }, (_, index) => index * 1.25), 1_000, 100_000]
    const inputs = [-100, 0, 0.05, 0.09, 0.14, 0.18, 0.22, 1, 100]

    // Exercise the shader itself over 150 seconds plus long-running clocks,
    // every 3.75 degrees, and the full clamped beat range including outliers.
    for (const time of times) {
      for (const size of inputs) {
        const radialRanges = Array.from({ length: 3 }, () => ({ min: Infinity, max: -Infinity }))
        let largestCore = 0
        for (let sample = 0; sample < 96; sample += 1) {
          const { rings, coreRadius } = sampleShader(time, size, sample * Math.PI * 2 / 96)
          largestCore = Math.max(largestCore, coreRadius)
          finiteGeometry &&= Number.isFinite(coreRadius) && coreRadius > 0 && rings.length === 3
          rings.forEach(({ radius, thickness }, index) => {
            finiteGeometry &&= Number.isFinite(radius) && Number.isFinite(thickness)
            minimumThickness = Math.min(minimumThickness, thickness)
            radialRanges[index].min = Math.min(radialRanges[index].min, radius - thickness)
            radialRanges[index].max = Math.max(radialRanges[index].max, radius + thickness)
          })
        }
        // Compare full-contour extrema from the same frame. Extrema from
        // different breathing phases never coexist and cannot cause overlap.
        minimumRingGaps[0] = Math.min(minimumRingGaps[0], radialRanges[0].min - radialRanges[1].max)
        minimumRingGaps[1] = Math.min(minimumRingGaps[1], radialRanges[1].min - radialRanges[2].max)
        minimumCoreGap = Math.min(minimumCoreGap, radialRanges[2].min - largestCore)
        largestOuterRadius = Math.max(largestOuterRadius, radialRanges[0].max)
      }
    }

    expect(finiteGeometry).toBe(true)
    expect(minimumThickness).toBeGreaterThan(0)
    expect(minimumRingGaps[0]).toBeGreaterThan(0.01)
    expect(minimumRingGaps[1]).toBeGreaterThan(0.01)
    expect(minimumCoreGap).toBeGreaterThan(0.01)

    const { position0 } = BRAND_SCENE.controls as { position0: { z: number } }
    const { fov } = BRAND_SCENE.intent as { fov: number }
    const { scale } = BRAND_SCENE.visualizer as { scale: number }
    const cameraHalfHeight = position0.z * Math.tan(fov * Math.PI / 360)
    expect(largestOuterRadius * scale).toBeLessThan(cameraHalfHeight * 0.85)
  })

  it('uses an unlit lavender, teal, and pink palette with a violet core', () => {
    const shader = (BRAND_SCENE.visualizer as { shader: string }).shader
    const colors = Array.from(shader.matchAll(/\bcolor\(([^)]*)\)/g), ([, channels]) => channels.split(',').map(Number))

    expect(shader).toMatch(/\bnoLighting\(\s*\)/)
    expect(shader).not.toMatch(/\b(?:metal|shine)\(/)
    expect(colors).toEqual([
      [0.2, 0.12, 1.25],
      [0.002, 0.28, 0.16],
      [0.32, 0.005, 0.11],
      [0.07, 0.035, 0.8],
    ])
  })

  it('applies native bloom before the final output pass without changing tone mapping', () => {
    expect(BRAND_SCENE.fx).toMatchObject({
      passOrder: ['bloom', 'outputPass'],
      bloom: { enabled: true, strength: 0.65, radius: 0.75, threshold: 0.22 },
      toneMapping: { method: 4, exposure: 0.55 },
      passes: { outputPass: true },
    })
  })
})
