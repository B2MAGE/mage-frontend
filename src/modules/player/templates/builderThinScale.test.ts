import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { compileBuilderPreviewDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'

type Vector = [number, number, number]
function boxDistance(point: Vector, extent: Vector) {
  const delta = point.map((value, index) => Math.abs(value) - extent[index])
  return Math.hypot(...delta.map(value => Math.max(value, 0))) + Math.min(Math.max(...delta), 0)
}
function march(distance: (point: Vector) => number, x: number, y: number) {
  let t = 0, iterations = 0
  for (; iterations < 96 && t <= 100; iterations++) {
    const value = distance([x, y, 5.5 - t])
    if (value < 0.00001) return { hit: true, t, iterations }
    t += value * 0.7
  }
  return { hit: false, t, iterations }
}
function fixture(): BuilderSceneDocument {
  return parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'thin-box', operation: { type: 'box', width: 2, height: 1, depth: 1 },
      drivers: [{ target: 'scale.x', mode: 'replace', expression: { type: 'constant', value: -2 } }] }],
  }) as BuilderSceneDocument
}

describe('thin Builder scale distance bounds', () => {
  it.each([0.01, 0.05, 0.1])('converges to the unchanged box surface at width scale %s with the current iteration budget', width => {
    const original = (point: Vector) => boxDistance([point[0] / width, point[1], point[2]], [2, 1, 1]) * width
    const bounded = (point: Vector) => Math.max(original(point), boxDistance(point, [2 * width, 1, 1]))
    const before = march(original, 0, 0)
    expect(before.hit).toBe(false)
    expect(before.t).toBeLessThan(100)
    const after = march(bounded, 0, 0)
    expect(after.hit).toBe(true)
    expect(after.t).toBeCloseTo(4.5, 4)
    expect(after.iterations).toBeLessThan(20)
    expect(march(bounded, 0, 3).hit).toBe(false)
    expect(march(bounded, 2 * width + 0.02, 0).hit).toBe(false)
  })

  it('captures unscaled coordinates before division in the actual packaged compiler output', () => {
    const compiled = compileBuilderPreviewDocument(fixture())
    const artifact = compileShader(compiled.shader)
    const geo = artifact.geoGLSL.slice(artifact.geoGLSL.lastIndexOf('float surfaceDistance'))
    const capture = geo.match(/vec3 (v_\d+) = (scope_\d+_p);\s+vec3 (v_\d+) = vec3\([^;]+\);\s+vec3 (v_\d+) = \(\1\+\3\);/)
    expect(capture).not.toBeNull()
    const snapshot = geo.indexOf(capture![0])
    const division = geo.indexOf(`${capture![2]} = `, snapshot)
    const boundRead = geo.indexOf(`abs(${capture![4]})`, division)
    expect(division).toBeGreaterThan(snapshot)
    expect(boundRead).toBeGreaterThan(division)
    expect(compiled.shader).toContain('max(0.01,min(20,')
    expect(compiled.shader).toContain('max(builder_distance_0_0*')
    expect(compiled.workload.expandedPrimitives).toBe(1)
  })

  it('retains numeric live edits and accounts for expanded/shelled and twisted primitives', () => {
    const scene = fixture()
    scene.objects[0].operation = { type: 'torus', radius: 0.8, tube: 0.15 }
    scene.objects[0].modifiers = [{ type: 'twist', axis: 'x', amount: 1 }, { type: 'twist', axis: 'y', amount: 0.5 },
      { type: 'expand', amount: 0.2 }, { type: 'shell', thickness: 0.1 }]
    const before = compileBuilderPreviewDocument(scene)
    expect(before.shader).toContain('builder_bound_radius_0_0_1')
    expect(before.shader.indexOf('let builder_bound_radius_0_0_1')).toBeLessThan(before.shader.indexOf('let builder_bound_radius_0_0_0'))
    expect(before.shader).toContain('0.30000000000000004')
    expect(() => compileShader(before.shader)).not.toThrow()
    scene.objects[0].drivers![0].expression = { type: 'constant', value: 0.3 }
    expect(compileBuilderPreviewDocument(scene).shader).toBe(before.shader)
  })

  it.each(['local-position', 'group-position', 'world-position'] as const)('skips fixed bounds for %s dependent objects and ancestor groups', source => {
    const expression: BuilderDriverExpression = { type: 'component', axis: 'x', input: { type: 'input', source } }
    const scene = fixture()
    scene.objects[0].drivers![0].expression = expression
    expect(compileBuilderPreviewDocument(scene).shader).not.toContain('builder_bound_distance')
    const groupScene = fixture()
    groupScene.composition = { version: 1, roots: ['g'], groups: [{ id: 'g', name: 'Spatial frame', children: ['thin-box'],
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 },
      operation: { type: 'union' }, drivers: [{ target: 'scale', mode: 'add', expression }] }] }
    expect(compileBuilderPreviewDocument(groupScene).shader).not.toContain('builder_bound_distance')
  })

  it('can accelerate view-ray rotations, which remain fixed along a pixel ray', () => {
    const scene = fixture()
    scene.objects[0].drivers!.push({ target: 'rotation.y', mode: 'add', expression: {
      type: 'component', axis: 'y', input: { type: 'input', source: 'view-ray' },
    } })
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.shader).toContain('builder_bound_distance_0_0')
    expect(() => compileShader(compiled.shader)).not.toThrow()
  })
})
