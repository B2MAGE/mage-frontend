import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { getTemplateDefinition } from './templateRegistry'

type Vector = { x: number; y: number; z: number }
const vector = (x: number, y: number, z: number): Vector => ({ x, y, z })
const originalStep = 0.04586632133333666
const source = getTemplateDefinition('embedded-scene-5', 1)!.shader

/** Run the actual compiled Alloy scalar/rotation instructions and shipped march
 * loop against the three SDF operations it uses. No browser/GPU timing involved.
 */
function compileProbe(shader: string) {
  const artifact = compileShader(shader, { maxRaymarchIterations: 96 })
  const geoBody = artifact.geoGLSL.slice(artifact.geoGLSL.lastIndexOf('float surfaceDistance'))
    .replace(/^float surfaceDistance\(vec3 p\) \{/, '').replace(/\}\s*$/, '')
    .replace(/(\w+)\.([xyz])([xyz]) = \1\.\2\3\*rot2\(([^;]+)\);/g,
      '$1 = rotate($1, "$2", "$3", $4);')
    .replace(/\b(?:float|vec3) (\w+) =/g, 'let $1 =')
  const rotate = (point: Vector, first: keyof Vector, second: keyof Vector, angle: number) => ({
    ...point,
    [first]: point[first] * Math.cos(angle) + point[second] * Math.sin(angle),
    [second]: -point[first] * Math.sin(angle) + point[second] * Math.cos(angle),
  })
  const sphere = (point: Vector, radius: number) => Math.hypot(point.x, point.y, point.z) - radius
  const cylinder = (point: Vector, radius: number, height: number) => {
    const radial = Math.hypot(point.x, point.z) - radius, vertical = Math.abs(point.y) - height
    return Math.min(Math.max(radial, vertical), 0) + Math.hypot(Math.max(radial, 0), Math.max(vertical, 0))
  }
  const smoothAdd = (a: number, b: number, amount: number) => {
    const weight = Math.min(1, Math.max(0, .5 + .5 * (b - a) / amount))
    return b * (1 - weight) + a * weight - amount * weight * (1 - weight)
  }
  const sample = new Function('p', 'size', 'time', 'mouse', 'pointerDown', 'getRayDirection',
    'vec3', 'rotate', 'sphere', 'cylinder', 'add', 'smoothAdd', 'nsin', geoBody)
  const loop = artifact.frag.match(/float intersect\(vec3 ro, vec3 rd, float stepFraction\) \{([\s\S]*?)\n\}/)![1]
    .replace(/surfaceDistance\(\(ro \+ rd \* t\)\)/g, 'surfaceDistance(t)')
    .replace(/\b(?:float|int)\b/g, 'let')
  const march = new Function('surfaceDistance', 'MAX_ITERATIONS', 'STEP_SIZE_CONSTANT', 'max_dist', 'intersection_threshold', loop)
  const iterations = Number(artifact.frag.match(/const int MAX_ITERATIONS = ([\d.]+);/)![1])
  const step = Number(artifact.frag.match(/const float STEP_SIZE_CONSTANT = ([\d.]+);/)![1])
  return {
    artifact, iterations,
    trace(size: number, time: number, origin = vector(0, 0, .55), ray = vector(0, 0, -1)) {
      let samples = 0, lastDistance = 0
      const distance = (t: number) => {
        samples++
        lastDistance = sample(vector(origin.x + ray.x * t, origin.y + ray.y * t, origin.z + ray.z * t),
          size, time, vector(0, 0, 0), 0, () => ray, vector, rotate, sphere, cylinder, Math.min,
          smoothAdd, (value: number) => (Math.sin(value) + 1) / 2) as number
        return lastDistance
      }
      return { distance: march(distance, iterations, step, 100, .00001) as number, samples, lastDistance }
    },
  }
}

describe('Alloy Capsule template surface convergence', () => {
  it('reaches the actual surface at idle and with audio without increasing the template iteration budget', () => {
    const probe = compileProbe(source)
    expect(probe.iterations).toBe(56)
    for (const size of [.006, .02, .12, .4]) for (const time of [0, 4, 12]) {
      const result = probe.trace(size, time)
      expect(result.distance, `size ${size}, time ${time}`).toBeLessThan(100)
      expect(result.lastDistance).toBeLessThan(.00001)
      expect(result.samples).toBeLessThanOrEqual(56)
    }
  })

  it('fixes slow convergence without changing any geometry, material or input code', () => {
    const current = compileProbe(source)
    const previous = compileProbe(source.replace(/setStepSize\([\d.]+\)/, `setStepSize(${originalStep})`))
    expect(current.artifact.geoGLSL).toBe(previous.artifact.geoGLSL)
    expect(current.artifact.colorGLSL).toBe(previous.artifact.colorGLSL)
    expect(current.artifact.uniforms).toEqual(previous.artifact.uniforms)
    const oldResult = previous.trace(.02, 0), result = current.trace(.02, 0)
    expect(oldResult.distance).toBe(100)
    expect(oldResult.samples).toBe(56)
    expect(oldResult.lastDistance).toBeGreaterThan(.00001)
    expect(result.distance).toBeGreaterThan(.5)
    expect(result.distance).toBeLessThan(.55)
    expect(result.samples).toBeLessThan(20)
  })

  it('preserves transparent misses outside the shape', () => {
    const result = compileProbe(source).trace(.02, 0, vector(0, 0, .55), vector(Math.SQRT1_2, 0, -Math.SQRT1_2))
    expect(result.distance).toBe(100)
    expect(result.samples).toBeLessThanOrEqual(56)
  })
})
