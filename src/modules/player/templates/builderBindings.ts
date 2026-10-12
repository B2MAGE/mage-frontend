import policy from '../../../../contracts/scenes/builder-rendering.v1.json'
import { BUILDER_BINDING_LIMIT, BUILDER_BINDING_RULES, BUILDER_LIMITS } from './builderDefinitions'
import type { BuilderBinding, BuilderSceneDocument } from './sceneContract'
import type { BuilderUniform } from './builderCompiler'

/** Addresses are data, never authored shader uniform names. */
export type BuilderLiveBinding = BuilderBinding & { objectIndex: number }

function fail(path: string): never { throw new Error(`${path}: invalid Builder response binding.`) }

function readBinding(value: unknown, path: string, indexed = false): BuilderBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return fail(path)
  const allowed = [...Object.keys(BUILDER_BINDING_RULES), ...(indexed ? ['objectIndex'] : [])]
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')) fail(path)
  }
  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(BUILDER_BINDING_RULES)) {
    const field = Object.hasOwn(record, key) ? record[key] : 'default' in rule ? rule.default : undefined
    if ('enum' in rule) {
      if (typeof field !== 'string' || !rule.enum.includes(field)) fail(`${path}.${key}`)
    } else if (typeof field !== 'number' || !Number.isFinite(field)
      || field < rule.minimum || field > rule.maximum) fail(`${path}.${key}`)
    result[key] = field
  }
  return result as BuilderBinding
}

/** Compiler preflight is independent of the storage/parser entry point. */
export function validateBuilderBindings(value: unknown, path = 'sceneData.objects.bindings'): BuilderBinding[] {
  if (!Array.isArray(value) || value.length > BUILDER_BINDING_LIMIT) return fail(path)
  const seen = new Set<string>()
  return Array.from(value, (item, index) => {
    const binding = readBinding(item, `${path}[${index}]`)
    if (seen.has(binding.target)) fail(`${path}[${index}].target`)
    seen.add(binding.target)
    return binding
  })
}

export function builderLiveBindings(document: BuilderSceneDocument): BuilderLiveBinding[] {
  const result = document.objects.flatMap((object, objectIndex) =>
    validateBuilderBindings(object.bindings, `sceneData.objects[${objectIndex}].bindings`)
      .map(binding => ({ objectIndex, ...binding })))
  if (result.length > policy.limits.liveUniforms) fail('sceneData.objects.bindings')
  return result
}

/** Strict bounded wire validation; the renderer also checks the loaded manifest. */
export function validateBuilderLiveBindings(value: unknown): BuilderLiveBinding[] {
  if (!Array.isArray(value) || value.length > policy.limits.liveUniforms) return fail('builderBindings')
  const targets = new Map<number, Set<string>>()
  return Array.from(value, (item, index) => {
    const path = `builderBindings[${index}]`
    const binding = readBinding(item, path, true)
    const objectIndex = item.objectIndex
    if (!Number.isInteger(objectIndex) || objectIndex < 0 || objectIndex >= BUILDER_LIMITS.objects) fail(path)
    const seen = targets.get(objectIndex) ?? new Set<string>()
    if (seen.has(binding.target) || seen.size >= BUILDER_BINDING_LIMIT) fail(path)
    seen.add(binding.target); targets.set(objectIndex, seen)
    return { objectIndex, ...binding }
  })
}

export function assertBuilderBindingManifest(bindings: readonly BuilderLiveBinding[], manifest: readonly BuilderUniform[]) {
  const validated = validateBuilderLiveBindings(bindings)
  for (const binding of validated) {
    if (!manifest.some(uniform => 'objectIndex' in uniform && uniform.objectIndex === binding.objectIndex
      && uniform.target === binding.target)) fail('builderBindings')
  }
}
