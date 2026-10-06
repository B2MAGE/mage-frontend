import schema from '../../../../contracts/scenes/scene-v1.schema.json'
import type { JsonRecord, JsonValue, TemplateSceneDocument } from './sceneContract'
import { templateOptionalEffectCount } from './templateSettings'

type Rule = {
  $ref?: string; type?: string; const?: JsonValue; enum?: JsonValue[]; anyOf?: Rule[]
  properties?: Record<string, Rule>; required?: string[]; additionalProperties?: boolean
  items?: Rule; minItems?: number; maxItems?: number; uniqueItems?: boolean
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number; pattern?: string
  default?: JsonValue; 'x-uniqueBy'?: string; 'x-maxOptionalEffects'?: number
}
type Fail = (path: string, detail: string) => never
const supported = new Set(['$ref', 'type', 'const', 'enum', 'anyOf', 'properties', 'required',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum',
  'minLength', 'maxLength', 'pattern', 'default', 'x-uniqueBy', 'x-maxOptionalEffects', 'title', 'description'])

/** Interpret the shared, data-only builder schema without generating or executing code. */
export function normalizeBuilderDocument(value: JsonRecord, fail: Fail): JsonRecord {
  const visit = (input: JsonValue, rule: Rule, path: string): JsonValue => {
    for (const key of Object.keys(rule)) {
      if (!supported.has(key)) throw new Error(`Unsupported builder schema keyword: ${key}`)
    }
    if (rule.$ref) {
      if (!rule.$ref.startsWith('#/')) throw new Error('Builder schema references must be local.')
      let target: unknown = schema
      for (const part of rule.$ref.slice(2).split('/')) {
        target = (target as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')]
      }
      if (!target || typeof target !== 'object') throw new Error('Unknown builder schema reference.')
      return visit(input, target as Rule, path)
    }
    if (rule.anyOf) {
      // Builder unions use a literal `type` discriminator. Resolve it first so
      // validation errors point at the selected operation instead of a later branch.
      if (input && typeof input === 'object' && !Array.isArray(input) && typeof input.type === 'string') {
        const branch = rule.anyOf.find(candidate => candidate.properties?.type?.const === input.type)
        if (branch) return visit(input, branch, path)
      }
      // Failed branches never mutate input.
      let deepest: Error | undefined
      for (const branch of rule.anyOf) {
        try { return visit(input, branch, path) } catch (error) {
          if (!(error instanceof Error) || error.name !== 'SceneContractError') throw error
          if (!deepest || error.message.lastIndexOf(': ') > deepest.message.lastIndexOf(': ')) deepest = error
        }
      }
      if (deepest) throw deepest
      return fail(path, 'expected a supported operation with valid parameters')
    }
    if ('const' in rule && input !== rule.const) fail(path, `expected ${String(rule.const)}`)
    if (rule.enum && !rule.enum.includes(input)) fail(path, 'unsupported value')
    if (rule.type === 'object') {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(path, 'expected an object')
      const properties = rule.properties ?? {}
      for (const key of rule.required ?? []) if (!(key in input)) fail(`${path}.${key}`, 'required field is missing')
      const result: JsonRecord = {}
      for (const [key, item] of Object.entries(input)) {
        if (!(key in properties)) {
          if (rule.additionalProperties === false) fail(`${path}.${key}`, 'unknown field')
          result[key] = item
        }
      }
      for (const [key, childRule] of Object.entries(properties)) {
        const item = key in input ? input[key] : childRule.default
        if (item !== undefined) result[key] = visit(item, childRule, `${path}.${key}`)
      }
      if (rule['x-maxOptionalEffects'] !== undefined
        && templateOptionalEffectCount(result as TemplateSceneDocument['settings']) > rule['x-maxOptionalEffects']) {
        fail(`${path}.effects`, `enable at most ${rule['x-maxOptionalEffects']} optional effects, including bloom and tint`)
      }
      return result
    }
    if (rule.type === 'array') {
      if (!Array.isArray(input)) return fail(path, 'expected an array')
      if (rule.maxItems !== undefined && input.length > rule.maxItems) fail(path, `expected at most ${rule.maxItems} items`)
      if (rule.minItems !== undefined && input.length < rule.minItems) fail(path, `expected at least ${rule.minItems} items`)
      const seen = new Set<string | undefined>()
      return input.map((item, index) => {
        const itemPath = `${path}[${index}]`
        const value = rule.items ? visit(item, rule.items, itemPath) : item
        const uniqueKey = rule['x-uniqueBy']
        if (rule.uniqueItems || uniqueKey) {
          const identity = JSON.stringify(uniqueKey ? (value as JsonRecord)[uniqueKey] : value)
          if (seen.has(identity)) fail(itemPath, uniqueKey ? `duplicate ${uniqueKey} values are not allowed` : 'duplicate items are not allowed')
          seen.add(identity)
        }
        return value
      })
    }
    if (rule.type === 'number' || rule.type === 'integer') {
      if (typeof input !== 'number' || !Number.isFinite(input)) return fail(path, 'expected a finite number')
      if (rule.type === 'integer' && !Number.isInteger(input)) fail(path, 'expected an integer')
      if (rule.minimum !== undefined && input < rule.minimum) fail(path, `expected at least ${rule.minimum}`)
      if (rule.maximum !== undefined && input > rule.maximum) fail(path, `expected at most ${rule.maximum}`)
    } else if (rule.type === 'string') {
      if (typeof input !== 'string') return fail(path, 'expected a string')
      const length = [...input].length
      if (rule.minLength !== undefined && length < rule.minLength) fail(path, `expected at least ${rule.minLength} characters`)
      if (rule.maxLength !== undefined && length > rule.maxLength) fail(path, `expected at most ${rule.maxLength} characters`)
      if (rule.pattern && !new RegExp(rule.pattern, 'u').test(input)) fail(path, 'unsupported string format')
    } else if (rule.type === 'boolean' && typeof input !== 'boolean') fail(path, 'expected a boolean')
    else if (rule.type && !['number', 'integer', 'string', 'boolean'].includes(rule.type)) throw new Error('Unsupported builder schema type.')
    return input
  }
  return visit(value, schema.$defs.builder as unknown as Rule, 'scene') as JsonRecord
}
