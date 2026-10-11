import { BUILDER_BINDING_RANGES, BUILDER_LIMITS } from './builderDefinitions'
import { BUILDER_RENDERING_POLICY, type BuilderUniform } from './builderCompiler'
import type { BuilderBinding } from './sceneContract'

export type BuilderUniformValue = { objectIndex: number; target: BuilderBinding['target']; value: number }

export function builderUniformValues(manifest: readonly BuilderUniform[]): BuilderUniformValue[] {
  return manifest.map(({ objectIndex, target, initialValue }) => ({ objectIndex, target, value: initialValue }))
}

/** Called after the scene-settings descriptor and JSON budget checks. */
export function validateBuilderUniformValues(value: unknown): BuilderUniformValue[] {
  if (!Array.isArray(value) || value.length > BUILDER_RENDERING_POLICY.limits.liveUniforms) throw new Error('Invalid Builder settings.')
  const seen = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).sort().join(',') !== 'objectIndex,target,value'
      || !Number.isInteger(item.objectIndex) || item.objectIndex < 0 || item.objectIndex >= BUILDER_LIMITS.objects
      || typeof item.target !== 'string' || !Object.hasOwn(BUILDER_BINDING_RANGES, item.target)) throw new Error('Invalid Builder settings.')
    const target = item.target as BuilderBinding['target']
    const range = BUILDER_BINDING_RANGES[target]
    const key = `${item.objectIndex}:${target}`
    if (seen.has(key) || !Number.isFinite(item.value) || item.value < range.minimum || item.value > range.maximum) throw new Error('Invalid Builder settings.')
    seen.add(key)
    return { objectIndex: item.objectIndex, target, value: item.value }
  })
}

export function assertBuilderUniformManifest(values: readonly BuilderUniformValue[], manifest: readonly BuilderUniform[]) {
  if (values.length !== manifest.length || values.some((entry, index) => {
    const uniform = manifest[index]
    return entry.objectIndex !== uniform.objectIndex || entry.target !== uniform.target
      || !Number.isFinite(entry.value) || entry.value < uniform.minimum || entry.value > uniform.maximum
  })) throw new Error('Builder settings do not match the loaded scene.')
}
