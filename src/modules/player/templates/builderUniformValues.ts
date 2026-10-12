import { BUILDER_BINDING_RANGES, BUILDER_GROUP_RANGES, BUILDER_LIMITS, type BuilderGroupTarget } from './builderDefinitions'
import { BUILDER_RENDERING_POLICY, type BuilderUniform } from './builderCompiler'
import type { BuilderBinding } from './sceneContract'

export type BuilderUniformValue = { objectIndex: number; target: BuilderBinding['target']; value: number }
  | { groupIndex: number; target: BuilderGroupTarget; value: number }
  | { driverSlot: number; target: 'driver-value' | 'driver-signal'; value: number }

export function builderUniformValues(manifest: readonly BuilderUniform[]): BuilderUniformValue[] {
  return manifest.map(uniform => 'objectIndex' in uniform
    ? { objectIndex: uniform.objectIndex, target: uniform.target, value: uniform.initialValue }
    : 'groupIndex' in uniform ? { groupIndex: uniform.groupIndex, target: uniform.target, value: uniform.initialValue }
      : { driverSlot: uniform.driverSlot, target: uniform.target, value: uniform.initialValue })
}

/** Called after the scene-settings descriptor and JSON budget checks. */
export function validateBuilderUniformValues(value: unknown): BuilderUniformValue[] {
  if (!Array.isArray(value) || value.length > BUILDER_RENDERING_POLICY.limits.liveUniforms) throw new Error('Invalid Builder settings.')
  const seen = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Builder settings.')
    if (Object.hasOwn(item, 'driverSlot')) {
      const key = `driverSlot:${item.driverSlot}`
      if (Object.keys(item).sort().join(',') !== 'driverSlot,target,value'
        || !Number.isInteger(item.driverSlot) || item.driverSlot < 0 || item.driverSlot >= BUILDER_RENDERING_POLICY.limits.liveUniforms
        || !['driver-value', 'driver-signal'].includes(item.target)
        || !Number.isFinite(item.value) || Math.abs(item.value) > (item.target === 'driver-signal' ? 1 : 1000)
        || item.target === 'driver-signal' && item.value !== 0 || seen.has(key)) throw new Error('Invalid Builder settings.')
      seen.add(key)
      return { driverSlot: item.driverSlot, target: item.target as 'driver-value' | 'driver-signal', value: item.value }
    }
    const group = Object.hasOwn(item, 'groupIndex')
    const address = group ? 'groupIndex' : 'objectIndex'
    const index = item[address]
    const ranges = group ? BUILDER_GROUP_RANGES : BUILDER_BINDING_RANGES
    const maximum = group ? BUILDER_LIMITS.groups : BUILDER_LIMITS.objects
    if (Object.keys(item).sort().join(',') !== `${address},target,value`
      || !Number.isInteger(index) || index < 0 || index >= maximum
      || typeof item.target !== 'string' || !Object.hasOwn(ranges, item.target)) throw new Error('Invalid Builder settings.')
    const range = (ranges as Record<string, { minimum: number; maximum: number }>)[item.target]
    const key = `${address}:${index}:${item.target}`
    if (seen.has(key) || !Number.isFinite(item.value) || item.value < range.minimum || item.value > range.maximum) throw new Error('Invalid Builder settings.')
    seen.add(key)
    return group ? { groupIndex: index, target: item.target as BuilderGroupTarget, value: item.value }
      : { objectIndex: index, target: item.target as BuilderBinding['target'], value: item.value }
  })
}

export function assertBuilderUniformManifest(values: readonly BuilderUniformValue[], manifest: readonly BuilderUniform[]) {
  if (values.length !== manifest.length || values.some((entry, index) => {
    const uniform = manifest[index]
    const addressMatches = 'objectIndex' in entry
      ? 'objectIndex' in uniform && entry.objectIndex === uniform.objectIndex
      : 'groupIndex' in entry ? 'groupIndex' in uniform && entry.groupIndex === uniform.groupIndex
        : 'driverSlot' in uniform && entry.driverSlot === uniform.driverSlot
    return !addressMatches || entry.target !== uniform.target
      || !Number.isFinite(entry.value) || entry.value < uniform.minimum || entry.value > uniform.maximum
  })) throw new Error('Builder settings do not match the loaded scene.')
}
