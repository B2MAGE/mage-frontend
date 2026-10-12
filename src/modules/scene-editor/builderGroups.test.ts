import { describe, expect, it } from 'vitest'
import { parseSceneDocument, type BuilderFrame } from '@modules/player'
import { compileBuilderDocument } from '../player/templates/builderCompiler'
import { addBuilderObject, createBuilderScene } from './builderEditor'
import { builderGroupingIssue, builderOrderedNodes, builderWorldFrame, composeBuilderFrames, duplicateBuilderNode,
  groupBuilderNodes, identityBuilderFrame, moveBuilderNode, removeBuilderNode, reparentBuilderNode, ungroupBuilderNode, updateBuilderGroup } from './builderGroups'

const scene = () => addBuilderObject(addBuilderObject(createBuilderScene(), 'box'), 'torus')
const grouped = () => groupBuilderNodes(scene(), ['object-1', 'object-2'], 'group-1')
const frame = (overrides: Partial<BuilderFrame> = {}): BuilderFrame => ({ ...identityBuilderFrame(), ...overrides })
function closeFrame(actual: BuilderFrame, expected: BuilderFrame) {
  for (const key of ['position', 'rotation'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(actual[key][axis]).toBeCloseTo(expected[key][axis], 9)
  expect(actual.scale).toBeCloseTo(expected.scale, 9)
}

function applyFrame(frame: BuilderFrame, point: BuilderFrame['position']) {
  let result = { x: point.x * frame.scale, y: point.y * frame.scale, z: point.z * frame.scale }
  for (const axis of frame.rotationOrder ?? 'xyz') {
    const angle = frame.rotation[axis as keyof typeof frame.rotation], c = Math.cos(angle), s = Math.sin(angle)
    const { x, y, z } = result
    result = axis === 'x' ? { x, y: y * c - z * s, z: y * s + z * c }
      : axis === 'y' ? { x: x * c + z * s, y, z: -x * s + z * c }
        : { x: x * c - y * s, y: x * s + y * c, z }
  }
  return { x: result.x + frame.position.x, y: result.y + frame.position.y, z: result.z + frame.position.z }
}

describe('Builder groups and authoring commands', () => {
  it('groups siblings in their existing order without modifying object IDs, geometry, or materials', () => {
    const original = scene()
    const result = groupBuilderNodes(original, ['object-2', 'object-1'], 'group-1')
    expect(result.objects).toEqual(original.objects)
    expect(result.composition?.roots).toEqual(['group-1', 'object-3'])
    expect(result.composition?.groups[0].children).toEqual(['object-1', 'object-2'])
    expect(builderOrderedNodes(result).map(node => node.id)).toEqual(['group-1', 'object-1', 'object-2', 'object-3'])
    expect(parseSceneDocument(result)).toEqual(result)
    expect(original.composition).toBeUndefined()
  })

  it('composes placement using forward X, Y, Z rotations with scale before translation', () => {
    const parent = frame({ position: { x: 3, y: 4, z: 5 }, rotation: { x: 0, y: 0, z: Math.PI / 2 }, scale: 2 })
    const child = frame({ position: { x: 1, y: 0, z: 0 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: .5 })
    closeFrame(composeBuilderFrames(parent, child), frame({ position: { x: 3, y: 6, z: 5 }, rotation: { x: Math.PI / 2, y: 0, z: Math.PI / 2 } }))
  })

  it('does not add empty placement data when ungrouping an unchanged group', () => {
    const result = ungroupBuilderNode(grouped(), 'group-1')
    expect(result.objects.every(object => !('frame' in object))).toBe(true)
    expect(parseSceneDocument(result)).toEqual(result)
  })

  it('respects rotation order instead of treating successive axis rotations as interchangeable', () => {
    const rotated = frame({ rotation: { x: Math.PI / 2, y: Math.PI / 2, z: 0 } })
    const point = frame({ position: { x: 0, y: 1, z: 0 } })
    const xyz = composeBuilderFrames(rotated, point).position
    const zyx = composeBuilderFrames({ ...rotated, rotationOrder: 'zyx' }, point).position
    expect(xyz.x).toBeCloseTo(1); expect(xyz.y).toBeCloseTo(0); expect(xyz.z).toBeCloseTo(0)
    expect(zyx.x).toBeCloseTo(0); expect(zyx.y).toBeCloseTo(0); expect(zyx.z).toBeCloseTo(1)
  })

  it.each(['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'] as const)('preserves child placement after ungrouping and reparenting a %s frame', rotationOrder => {
    let document = grouped()
    document.objects[0].frame = frame({ position: { x: .4, y: -.7, z: 1 }, rotation: { x: .2, y: -.4, z: .6 }, rotationOrder: 'yzx' })
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group,
      transform: frame({ rotation: { x: .4, y: .6, z: -.3 }, position: { x: 1, y: 2, z: -1 }, scale: 1.4, rotationOrder }) }))
    const before = composeBuilderFrames(identityBuilderFrame(), builderWorldFrame(document, 'object-1'))
    closeFrame(builderWorldFrame(ungroupBuilderNode(document, 'group-1'), 'object-1'), before)
    const moved = reparentBuilderNode(document, 'object-1', null)
    closeFrame(builderWorldFrame(moved, 'object-1'), before)
    closeFrame(builderWorldFrame(reparentBuilderNode(moved, 'object-1', 'group-1'), 'object-1'), before)
  })

  it.each(['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'] as const)('decomposes %s frames without changing their order or world geometry near gimbal lock', rotationOrder => {
    const point = { x: .7, y: -.3, z: 1.1 }
    for (const middle of [-Math.PI / 2, -Math.PI / 2 + .0001, .3, Math.PI / 2 - .0001, Math.PI / 2]) {
      const child = frame({ rotation: { x: .2, y: -.4, z: .6, [rotationOrder[1]]: middle }, rotationOrder })
      for (const parent of [identityBuilderFrame(), frame({ rotation: { x: -.7, y: .5, z: .1 }, rotationOrder: 'zxy',
        position: { x: 1, y: 2, z: -3 }, scale: 1.4 })]) {
        const composed = composeBuilderFrames(parent, child)
        expect(composed.rotationOrder).toBe(rotationOrder)
        const actual = applyFrame(composed, point), expected = applyFrame(parent, applyFrame(child, point))
        for (const axis of ['x', 'y', 'z'] as const) expect(actual[axis]).toBeCloseTo(expected[axis], 8)
      }
    }
  })

  it('keeps a driven ZYX group in ZYX after moving or ungrouping its identity parent', () => {
    let document = grouped()
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group,
      transform: frame({ rotationOrder: 'zyx' }), drivers: [
        { target: 'rotation.x', mode: 'add', expression: { type: 'constant', value: .4 } },
        { target: 'rotation.y', mode: 'add', expression: { type: 'input', source: 'time' } },
      ] }))
    document = groupBuilderNodes(document, ['group-1', 'object-3'], 'group-2')
    const before = document.composition!.groups.find(group => group.id === 'group-1')!
    for (const result of [reparentBuilderNode(document, 'group-1', null), ungroupBuilderNode(document, 'group-2')]) {
      const after = result.composition!.groups.find(group => group.id === 'group-1')!
      expect(after.transform.rotationOrder).toBe('zyx')
      expect(after.drivers).toEqual(before.drivers)
      const shader = compileBuilderDocument(result).shader
      const source = shader.slice(shader.indexOf('let builder_group_0=shape'))
      expect(source.indexOf('rotateX(')).toBeLessThan(source.indexOf('rotateY('))
      expect(source.indexOf('rotateY(')).toBeLessThan(source.indexOf('rotateZ('))
    }
  })

  it('ungroups transformed spinning arrangements without baking into their local animation, and keeps group material', () => {
    let document = grouped()
    document.objects[0].arrangements = [{ type: 'linear', count: 2, axis: 'x', spacing: 1 }]
    document.objects[0].motion = { type: 'spin', axis: 'y', speed: 1 }
    const localObject = structuredClone(document.objects[0])
    const transform = frame({ position: { x: 2, y: 3, z: 4 }, rotation: { x: .2, y: .4, z: .6 }, scale: 2 })
    const material = { color: '#ff00aa', metalness: .5, shininess: .8 }
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group, transform, material, operation: { type: 'smooth-union', blend: .4 } }))
    const result = ungroupBuilderNode(document, 'group-1')
    expect(result.composition?.roots).toEqual(['object-1', 'object-2', 'object-3'])
    expect(result.composition?.groups).toEqual([])
    const { frame: placement, ...resultObject } = result.objects[0]
    expect(resultObject).toEqual({ ...localObject, material })
    closeFrame(placement!, transform)
    expect(parseSceneDocument(result)).toEqual(result)
  })

  it('bakes the outer group frame and material into an inner group without changing its own composition', () => {
    const inner = grouped()
    let document = groupBuilderNodes(inner, ['group-1', 'object-3'], 'group-2')
    const innerFrame = frame({ position: { x: 1, y: 2, z: 3 }, rotation: { x: .5, y: -.2, z: .3 }, scale: .5 })
    const outerFrame = frame({ position: { x: 3, y: -2, z: 1 }, rotation: { x: -.2, y: .4, z: .8 }, scale: 2 })
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group, transform: innerFrame, operation: { type: 'smooth-union', blend: .3 } }))
    document = updateBuilderGroup(document, 'group-2', group => ({ ...group, transform: outerFrame, material: { color: '#112233', metalness: 0, shininess: .5 } }))
    const before = builderWorldFrame(document, 'object-1')
    const result = ungroupBuilderNode(document, 'group-2')
    closeFrame(builderWorldFrame(result, 'object-1'), before)
    expect(result.composition?.groups[0].operation).toEqual({ type: 'smooth-union', blend: .3 })
    expect(result.composition?.groups[0].material?.color).toBe('#112233')
    expect(parseSceneDocument(result)).toEqual(result)
  })

  it('moves children between groups and the root while preserving placement', () => {
    let document = grouped()
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group, transform: frame({ position: { x: 1, y: 2, z: 3 }, rotation: { x: .5, y: .2, z: -.3 }, scale: 2 }) }))
    const before = builderWorldFrame(document, 'object-3')
    const moved = reparentBuilderNode(document, 'object-3', 'group-1')
    closeFrame(builderWorldFrame(moved, 'object-3'), before)
    expect(moved.composition?.roots).toEqual(['group-1'])
    expect(moved.composition?.groups[0].children).toEqual(['object-1', 'object-2', 'object-3'])
    const restored = reparentBuilderNode(moved, 'object-3', null)
    closeFrame(builderWorldFrame(restored, 'object-3'), before)
    expect(parseSceneDocument(restored)).toEqual(restored)
  })

  it('rejects cycles, cross-parent grouping, and nesting beyond three group levels', () => {
    let document = grouped()
    expect(builderGroupingIssue(document, ['object-1', 'object-3'])).toMatch(/same group/)
    document = groupBuilderNodes(document, ['group-1', 'object-3'], 'group-2')
    expect(() => reparentBuilderNode(document, 'group-2', 'group-1')).toThrow(/inside itself/)
    document = addBuilderObject(document, 'sphere')
    document = groupBuilderNodes(document, ['group-2', 'object-4'], 'group-3')
    document = addBuilderObject(document, 'sphere')
    expect(builderGroupingIssue(document, ['group-3', 'object-5'])).toMatch(/three|3 levels/)
    expect(parseSceneDocument(document)).toEqual(document)
  })

  it('duplicates a complete subtree with fresh IDs and without shared mutable properties', () => {
    let document = grouped()
    document = groupBuilderNodes(document, ['group-1', 'object-3'], 'group-2')
    let sequence = 10
    const result = duplicateBuilderNode(document, 'group-2', kind => `${kind}-${sequence++}`)
    expect(result.objects).toHaveLength(6)
    expect(result.composition?.groups).toHaveLength(4)
    expect(new Set(builderOrderedNodes(result).map(node => node.id)).size).toBe(10)
    expect(result.composition?.roots).toEqual(['group-2', 'group-10'])
    result.objects[3].transform.position.x = 5
    expect(document.objects[0].transform.position.x).toBe(0)
    expect(parseSceneDocument(result)).toEqual(result)
  })

  it('removes whole subtrees and prunes a group after deleting its final child', () => {
    let document = grouped()
    document = removeBuilderNode(document, 'object-1')
    expect(document.composition?.groups[0].children).toEqual(['object-2'])
    document = removeBuilderNode(document, 'object-2')
    expect(document.composition?.groups).toEqual([])
    expect(document.composition?.roots).toEqual(['object-3'])
    expect(removeBuilderNode(grouped(), 'group-1').objects.map(object => object.id)).toEqual(['object-3'])
    expect(parseSceneDocument(document)).toEqual(document)
  })

  it('reorders siblings using IDs without changing the registry or moving nodes between parents', () => {
    const document = grouped()
    const result = moveBuilderNode(document, 'object-2', 'object-1')
    expect(result.composition?.groups[0].children).toEqual(['object-2', 'object-1'])
    expect(result.objects).toEqual(document.objects)
    expect(moveBuilderNode(result, 'object-2', 'object-3')).toBe(result)
    expect(moveBuilderNode(result, 'object-3', 'group-1').composition?.roots).toEqual(['object-3', 'group-1'])
  })

  it('refuses ungrouping and moving when the preserved frame would exceed contract bounds', () => {
    let document = grouped()
    document.objects[0].frame = frame({ scale: 2 })
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group, transform: frame({ scale: 20 }) }))
    const before = structuredClone(document)
    expect(() => ungroupBuilderNode(document, 'group-1')).toThrow(/supported position or scale range/)
    expect(document).toEqual(before)
    document = updateBuilderGroup(document, 'group-1', group => ({ ...group, transform: frame({ scale: .01 }) }))
    expect(() => reparentBuilderNode(document, 'object-3', 'group-1')).toThrow(/supported position or scale range/)
    expect(parseSceneDocument(document)).toEqual(document)
  })
})
