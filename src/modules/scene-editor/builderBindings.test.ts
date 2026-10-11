import { describe, expect, it } from 'vitest'
import { BUILDER_BINDING_RULES, createBuilderBinding } from '@modules/player'
import { createBuilderObject } from './builderEditor'
import { addBuilderBinding, availableBuilderBindingTargets, builderBindingResultRange, BUILDER_BINDING_SOURCE_LABELS,
  BUILDER_BINDING_TARGET_LABELS, removeBuilderBinding, updateBuilderBinding } from './builderBindings'

describe('Builder response controls and ranges', () => {
  it('labels exactly the properties and signals supported by the current contract', () => {
    expect(Object.keys(BUILDER_BINDING_TARGET_LABELS).sort()).toEqual([...BUILDER_BINDING_RULES.target.enum].sort())
    expect(Object.keys(BUILDER_BINDING_SOURCE_LABELS).sort()).toEqual([...BUILDER_BINDING_RULES.source.enum].sort())
  })
  it('adds unique property responses up to the limit, and removal frees the property', () => {
    let object = createBuilderObject('sphere')
    for (let index = 0; index < 5; index++) object = addBuilderBinding(object)
    expect(object.bindings).toHaveLength(4)
    expect(new Set(object.bindings.map(binding => binding.target)).size).toBe(4)
    expect(availableBuilderBindingTargets(object)).not.toContain('scale.x')
    object = removeBuilderBinding(object, 'scale.x')
    expect(addBuilderBinding(object).bindings.at(-1)?.target).toBe('scale.x')
    expect(updateBuilderBinding(object, 'scale.y', { target: 'scale.z' })).toBe(object)
  })
  it('changes an existing response without changing other responses or clamping invalid draft values', () => {
    const object = addBuilderBinding(addBuilderBinding(createBuilderObject('sphere')))
    const result = updateBuilderBinding(object, 'scale.x', { source: 'pointer-x', amount: -2, release: 10 })
    expect(result.bindings[0]).toMatchObject({ source: 'pointer-x', amount: -2, release: 10 })
    expect(result.bindings[1]).toEqual(object.bindings[1])
    expect(object.bindings[0].source).toBe('bass-level')
  })
  it('shows the possible musical range including the authored value and offset', () => {
    const object = createBuilderObject('sphere')
    const binding = { ...createBuilderBinding('scale.x', 'bass-hit'), amount: -.5, offset: .2 }
    expect(builderBindingResultRange(object, binding)).toEqual({ minimum: .7, maximum: 1.2, resting: 1.2, limited: false, unit: '×' })
  })
  it('accounts for negative pointer movement and the Set response mode', () => {
    const object = createBuilderObject('sphere')
    object.transform.position.x = 8
    const binding = { ...createBuilderBinding('position.x', 'pointer-x'), mode: 'replace' as const, amount: -2, offset: 1 }
    expect(builderBindingResultRange(object, binding)).toEqual({ minimum: -1, maximum: 3, resting: 1, limited: false, unit: 'units' })
  })
  it('reports property clamping and the zero-input result rather than promising an unreachable range', () => {
    const object = createBuilderObject('sphere')
    const binding = { ...createBuilderBinding('material.metalness', 'pointer-down'), mode: 'replace' as const, amount: 4, offset: -.5 }
    expect(builderBindingResultRange(object, binding)).toEqual({ minimum: 0, maximum: 1, resting: 0, limited: true, unit: '' })
  })
})
