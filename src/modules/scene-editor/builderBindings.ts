import { BUILDER_BINDING_LIMIT, BUILDER_BINDING_RANGES, createBuilderBinding, type BuilderBinding, type BuilderObject } from '@modules/player'

type Target = BuilderBinding['target']
type Source = BuilderBinding['source']

export const BUILDER_BINDING_TARGET_LABELS: Record<Target, string> = {
  'scale.x': 'Width (scale X)', 'scale.y': 'Height (scale Y)', 'scale.z': 'Depth (scale Z)',
  'position.x': 'Position X', 'position.y': 'Position Y', 'position.z': 'Position Z',
  'rotation.x': 'Rotation X', 'rotation.y': 'Rotation Y', 'rotation.z': 'Rotation Z',
  'material.metalness': 'Metalness', 'material.shininess': 'Shininess',
}
export const BUILDER_BINDING_SOURCE_LABELS: Record<Source, string> = {
  'bass-level': 'Bass level', 'mid-level': 'Mid level', 'treble-level': 'Treble level', 'overall-level': 'Whole mix level',
  'bass-hit': 'Bass hits', 'mid-hit': 'Mid hits', 'treble-hit': 'Treble hits', 'overall-hit': 'Whole mix hits',
  'pointer-x': 'Pointer horizontal', 'pointer-y': 'Pointer vertical', 'pointer-down': 'Pointer press',
}

export const BUILDER_BINDING_TARGETS = Object.keys(BUILDER_BINDING_TARGET_LABELS) as Target[]
export function availableBuilderBindingTargets(object: BuilderObject) {
  return BUILDER_BINDING_TARGETS.filter(target => !object.bindings.some(binding => binding.target === target))
}
export function addBuilderBinding(object: BuilderObject): BuilderObject {
  const target = availableBuilderBindingTargets(object)[0]
  if (!target || object.bindings.length >= BUILDER_BINDING_LIMIT) return object
  return { ...object, bindings: [...object.bindings, createBuilderBinding(target)] }
}
export function updateBuilderBinding(object: BuilderObject, target: Target, changes: Partial<BuilderBinding>): BuilderObject {
  if (!object.bindings.some(binding => binding.target === target)) return object
  if (changes.target && changes.target !== target && object.bindings.some(binding => binding.target === changes.target)) return object
  return { ...object, bindings: object.bindings.map(binding => binding.target === target ? { ...binding, ...changes } : binding) }
}
export function removeBuilderBinding(object: BuilderObject, target: Target): BuilderObject {
  return object.bindings.some(binding => binding.target === target)
    ? { ...object, bindings: object.bindings.filter(binding => binding.target !== target) } : object
}

export function builderBindingAuthoredValue(object: BuilderObject, target: Target): number {
  const [branch, component] = target.split('.')
  if (branch === 'material') return object.material[component as 'metalness' | 'shininess']
  return object.transform[branch as 'position' | 'rotation' | 'scale'][component as 'x' | 'y' | 'z']
}

/** Explain the same bounded affine mapping that the player applies to the selected property. */
export function builderBindingResultRange(object: BuilderObject, binding: BuilderBinding) {
  const rule = BUILDER_BINDING_RANGES[binding.target]
  const inputMin = binding.source === 'pointer-x' || binding.source === 'pointer-y' ? -1 : 0
  const base = binding.mode === 'add' ? builderBindingAuthoredValue(object, binding.target) : 0
  const first = base + binding.offset + binding.amount * inputMin
  const last = base + binding.offset + binding.amount
  const clamp = (value: number) => Math.max(rule.minimum, Math.min(rule.maximum, value))
  return { minimum: clamp(Math.min(first, last)), maximum: clamp(Math.max(first, last)),
    resting: clamp(base + binding.offset), limited: Math.min(first, last) < rule.minimum || Math.max(first, last) > rule.maximum,
    unit: binding.target.startsWith('rotation.') ? 'rad' : binding.target.startsWith('scale.') ? '×' : binding.target.startsWith('position.') ? 'units' : '' }
}
export const formatBuilderBindingNumber = (value: number) => Number(value.toFixed(2)).toString()
