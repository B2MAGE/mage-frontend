import policy from '../../../../contracts/scenes/scene-limits.v1.json'
import { hasSceneDocumentMarkers, parseSceneDocument, SceneContractError, type JsonRecord, type JsonValue, type SceneDocument, type PlayableSceneDocument } from '../templates/sceneContract'

/** Exact PP-V01 policy copy; bounds apply to data, never establish source trust. */
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T
function freezePolicy<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezePolicy)
    Object.freeze(value)
  }
  return value as Immutable<T>
}
export const SCENE_POLICY = freezePolicy(policy)
export const SCENE_LIMITS = Object.freeze({ ...policy.limits })
export const SCENE_RUNTIME_CEILINGS = Object.freeze({ ...policy.runtimeCeilings })
const encoder = new TextEncoder()
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/

export class SceneValidationError extends Error {
  readonly details: Readonly<Record<string, string>>

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`)
    this.name = 'SceneValidationError'
    this.details = Object.freeze({ [path]: detail })
  }
}

function invalid(path: string, detail: string): never {
  throw new SceneValidationError(path, detail)
}

function fieldPath(parent: string, key: string) {
  return identifier.test(key) && key.length <= SCENE_LIMITS.keyBytes ? `${parent}.${key}` : parent
}

type Budget = { bytes: number; depth: number; keys: number; nodes: number; path: string }
const sceneBudget: Budget = {
  bytes: SCENE_LIMITS.sceneBytes, depth: SCENE_LIMITS.sceneDepth,
  keys: SCENE_LIMITS.totalKeys, nodes: SCENE_LIMITS.totalNodes, path: 'sceneData',
}
type Visit = { value: unknown; path: string; depth: number; parent: JsonRecord | JsonValue[]; key: string | number }

/** Bound and clone data descriptors before any recursive contract parser or stringify. */
function boundedJson(value: unknown, budget: Budget = sceneBudget): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(budget.path, 'Must be a JSON object.')
  const holder: JsonRecord = {}
  const stack: Array<Visit | { leave: object }> = [{ value, path: budget.path, depth: 1, parent: holder, key: 'value' }]
  const ancestors = new Set<object>()
  let nodes = 0
  let keys = 0
  let bytes = 0
  const addBytes = (count: number) => {
    bytes += count
    if (bytes > budget.bytes) invalid(budget.path, `Serialized ${budget.path === 'request' ? 'request' : 'scene'} must not exceed ${budget.bytes} UTF-8 bytes.`)
  }
  const stringBytes = (text: string) => {
    // A string's serialized size can only be larger than its UTF-16 length.
    if (text.length > budget.bytes) invalid(budget.path, `Serialized scene must not exceed ${budget.bytes} UTF-8 bytes.`)
    return encoder.encode(JSON.stringify(text)).length
  }
  while (stack.length) {
    const item = stack.pop()!
    if ('leave' in item) { ancestors.delete(item.leave); continue }
    if (++nodes > budget.nodes) invalid(budget.path, `Too many JSON values; maximum is ${budget.nodes}.`)
    const { value: next, path, depth, parent, key } = item
    const put = (copy: JsonValue) => {
      if (Array.isArray(parent)) parent[key as number] = copy
      else parent[key as string] = copy
    }
    if (next === null) { addBytes(4); put(null); continue }
    if (typeof next === 'string') { addBytes(stringBytes(next)); put(next); continue }
    if (typeof next === 'boolean') { addBytes(next ? 4 : 5); put(next); continue }
    if (typeof next === 'number' && Number.isFinite(next)) { addBytes(JSON.stringify(next).length); put(next); continue }
    if (typeof next !== 'object') invalid(path, 'Must contain ordinary finite JSON values only.')
    if (depth > budget.depth) invalid(path, `JSON nesting exceeds ${budget.depth} levels.`)
    if (ancestors.has(next)) invalid(path, 'Cyclic scene data is not supported.')
    const array = Array.isArray(next)
    const prototype = Object.getPrototypeOf(next)
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      invalid(path, 'Must contain plain JSON objects and arrays only.')
    }
    const names = Reflect.ownKeys(next)
    const length = array ? next.length : names.length
    if (length > (array ? SCENE_LIMITS.arrayItems : SCENE_LIMITS.objectKeys)) {
      invalid(path, array ? `Too many array items; maximum is ${SCENE_LIMITS.arrayItems}.`
        : `Too many object fields; maximum is ${SCENE_LIMITS.objectKeys}.`)
    }
    if (array && names.length !== length + 1) invalid(path, 'Sparse arrays and additional array fields are not JSON data.')
    if (!array && (keys += length) > budget.keys) invalid(budget.path, `Too many total object fields; maximum is ${budget.keys}.`)
    const copy: JsonRecord | JsonValue[] = array ? [] : {}
    put(copy)
    addBytes(2 + Math.max(0, length - 1)) // Braces/brackets and commas.
    ancestors.add(next)
    stack.push({ leave: next })
    for (const name of names) {
      if (array && name === 'length') continue
      if (typeof name !== 'string') invalid(path, 'Symbol properties are not JSON data.')
      if (array && (!/^(0|[1-9]\d*)$/.test(name) || Number(name) >= length)) invalid(path, 'Additional array fields are not JSON data.')
      const childPath = array ? `${path}[${name}]` : fieldPath(path, name)
      if (forbiddenKeys.has(name)) invalid(childPath, 'Prototype-related fields are not allowed.')
      if (name.length > SCENE_LIMITS.keyBytes || encoder.encode(name).length > SCENE_LIMITS.keyBytes) {
        invalid(path, `Field names must not exceed ${SCENE_LIMITS.keyBytes} UTF-8 bytes.`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(next, name)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) invalid(childPath, 'Only enumerable data properties are supported.')
      if (!array) addBytes(stringBytes(name) + 1)
      stack.push({ value: descriptor.value, path: childPath, depth: depth + 1, parent: copy, key: array ? Number(name) : name })
    }
  }
  return holder.value as JsonRecord
}

type Rule = {
  type: string; fields?: Record<string, Rule>; required?: string[]; items?: Rule
  maxItems?: number; unique?: boolean; uniqueBy?: string; minimum?: number; maximum?: number; values?: JsonValue[]
}

function isBlankSource(source: string) {
  // Java Character.isWhitespace excludes NBSP, figure space and narrow NBSP.
  return Array.from(source).every(char => {
    const code = char.charCodeAt(0)
    return (code >= 9 && code <= 13) || (code >= 28 && code <= 32) || code === 0x1680
      || (code >= 0x2000 && code <= 0x2006) || (code >= 0x2008 && code <= 0x200a)
      || code === 0x2028 || code === 0x2029 || code === 0x205f || code === 0x3000
  })
}

function validateRule(value: JsonValue, rule: Rule, path: string): void {
  switch (rule.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'Must be an object.')
      for (const [key, child] of Object.entries(value)) {
        const childPath = fieldPath(path, key)
        const childRule = Object.hasOwn(rule.fields ?? {}, key) ? rule.fields![key] : undefined
        if (!childRule) invalid(childPath, 'Unknown field is not allowed.')
        validateRule(child, childRule, childPath)
      }
      for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) invalid(`${path}.${key}`, 'This field is required.')
      return
    }
    case 'array': {
      const max = rule.maxItems ?? SCENE_LIMITS.arrayItems
      if (!Array.isArray(value) || value.length > max) invalid(path, `Must be an array with at most ${max} items.`)
      const seen = new Set<string>()
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`
        validateRule(item, rule.items!, itemPath)
        const identity = JSON.stringify(rule.uniqueBy ? (item as JsonRecord)[rule.uniqueBy] : item)
        if ((rule.unique || rule.uniqueBy) && seen.has(identity)) invalid(itemPath, 'Duplicate items are not allowed.')
        seen.add(identity)
      })
      return
    }
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path, 'Must be a finite number.')
      if (rule.type === 'integer' && !Number.isInteger(value)) invalid(path, 'Must be a whole number.')
      if (value < rule.minimum! || value > rule.maximum!) invalid(path, `Must be between ${rule.minimum} and ${rule.maximum}.`)
      return
    case 'boolean':
      if (typeof value !== 'boolean') invalid(path, 'Must be a boolean.')
      return
    case 'enum':
      if (!rule.values?.some(option => option === value)) invalid(path, 'Unsupported value.')
      return
    case 'color':
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) invalid(path, 'Must be a six-digit hexadecimal color beginning with #.')
      return
    case 'source': {
      // Match Java String.isBlank, including its intentional exclusion of NBSP.
      if (typeof value !== 'string' || isBlankSource(value)) {
        invalid(path, 'Must be nonblank shader source text.')
      }
      if (value.length > SCENE_LIMITS.sourceBytes || encoder.encode(value).length > SCENE_LIMITS.sourceBytes) {
        invalid(path, `Shader source must not exceed ${SCENE_LIMITS.sourceBytes} UTF-8 bytes.`)
      }
      for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) {
          const low = value.charCodeAt(++index)
          if (!(low >= 0xdc00 && low <= 0xdfff)) invalid(path, 'Shader source must contain valid Unicode text.')
        } else if (code >= 0xdc00 && code <= 0xdfff) invalid(path, 'Shader source must contain valid Unicode text.')
      }
      return
    }
    default: throw new Error('Unsupported scene policy rule.')
  }
}

/** Validates explicit transport, then custom policy. It neither evaluates nor modifies source. */
export function validateSceneDocument(value: unknown): SceneDocument {
  const original = boundedJson(value)
  let document: SceneDocument
  try { document = parseSceneDocument(original) }
  catch (error) {
    if (!(error instanceof SceneContractError)) throw error
    const delimiter = error.message.lastIndexOf(': ')
    const path = error.message.slice(0, delimiter)
    const safe = /^scene(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(path)
    invalid(safe ? `sceneData${path.slice(5)}` : 'sceneData', delimiter >= 0 ? error.message.slice(delimiter + 2) : 'Unsupported scene document.')
  }
  boundedJson(document) // Materialized defaults also count toward the stored budget.
  if (document.kind === 'custom') {
    const path = 'sceneData.scene'
    boundedJson(document.scene, { ...sceneBudget, path })
    validateRule(document.scene, policy.scene as Rule, path)
    const fx = document.scene.fx as JsonRecord | undefined
    const passes = fx?.passes as JsonRecord | undefined
    let count = (fx?.bloom as JsonRecord | undefined)?.enabled === true ? 1 : 0
    for (const flag of policy.optionalEffectFlags) if (passes?.[flag] === true) count++
    if (count > SCENE_LIMITS.optionalEffects) invalid(`${path}.fx`, `Enable at most ${SCENE_LIMITS.optionalEffects} optional effects, including bloom.`)
  }
  return document
}

/** Legacy acceptance is compatibility only; the resulting custom label grants no execution permission. */
export function validateSceneForStorage(value: unknown, options: { allowLegacyRaw?: boolean } = {}): SceneDocument {
  const original = boundedJson(value)
  return validateSceneDocument(hasSceneDocumentMarkers(original) || options.allowLegacyRaw === false
    ? original : { schemaVersion: 1, kind: 'custom', scene: original })
}

/** A storable format is not necessarily supported by the current renderer. */
export function validateSceneForPlayback(value: unknown, options: { allowLegacyRaw?: boolean } = {}): PlayableSceneDocument {
  return validateSceneForStorage(value, options)
}

/** A small bounded JSON reader retains duplicate-key detection that JSON.parse loses. */
function parseImportJson(text: string): unknown {
  let cursor = 0
  let nodes = 0
  const skipSpace = () => { while (/[\t\n\r ]/.test(text[cursor] ?? '\0')) cursor++ }
  const malformed = (): never => invalid('sceneData', 'Scene data must be valid JSON.')
  const string = (): string => {
    const start = cursor++
    while (cursor < text.length) {
      if (text[cursor] === '\\') { cursor += 2; continue }
      if (text[cursor++] === '"') {
        try { return JSON.parse(text.slice(start, cursor)) as string } catch { return malformed() }
      }
    }
    return malformed()
  }
  const read = (depth: number, path: string): JsonValue => {
    skipSpace()
    if (++nodes > SCENE_LIMITS.totalNodes) invalid('sceneData', `Too many JSON values; maximum is ${SCENE_LIMITS.totalNodes}.`)
    const char = text[cursor]
    if (char === '"') return string()
    if (char === '{' || char === '[') {
      if (depth > SCENE_LIMITS.sceneDepth) invalid(path, `JSON nesting exceeds ${SCENE_LIMITS.sceneDepth} levels.`)
      cursor++
      const array = char === '['
      const result: JsonRecord | JsonValue[] = array ? [] : {}
      const names = new Set<string>()
      const end = array ? ']' : '}'
      skipSpace()
      if (text[cursor] === end) { cursor++; return result }
      let count = 0
      while (cursor < text.length) {
        if (++count > (array ? SCENE_LIMITS.arrayItems : SCENE_LIMITS.objectKeys)) invalid(path, array ? 'Too many array items.' : 'Too many object fields.')
        skipSpace()
        if (array) (result as JsonValue[]).push(read(depth + 1, `${path}[${count - 1}]`))
        else {
          if (text[cursor] !== '"') return malformed()
          const key = string()
          const childPath = fieldPath(path, key)
          if (names.has(key)) invalid(childPath, 'Duplicate object fields are not allowed.')
          if (forbiddenKeys.has(key)) invalid(childPath, 'Prototype-related fields are not allowed.')
          names.add(key)
          skipSpace()
          if (text[cursor++] !== ':') return malformed()
          ;(result as JsonRecord)[key] = read(depth + 1, childPath)
        }
        skipSpace()
        if (text[cursor] === end) { cursor++; return result }
        if (text[cursor++] !== ',') return malformed()
      }
      return malformed()
    }
    const start = cursor
    while (cursor < text.length && !/[\t\n\r ,\]}]/.test(text[cursor])) cursor++
    const token = text.slice(start, cursor)
    if (!token || token.length > 100) return malformed()
    try {
      const value: unknown = JSON.parse(token)
      if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value
    } catch { /* Invalid primitive tokens follow the same safe syntax error path. */ }
    return malformed()
  }
  const result = read(1, 'sceneData')
  skipSpace()
  if (cursor !== text.length) return malformed()
  return result
}

export function parseSceneImport(text: string): SceneDocument {
  if (typeof text !== 'string' || text.length > SCENE_LIMITS.requestBytes || encoder.encode(text).length > SCENE_LIMITS.requestBytes) {
    invalid('sceneData', `Scene JSON must not exceed ${SCENE_LIMITS.requestBytes} UTF-8 bytes.`)
  }
  return validateSceneForStorage(parseImportJson(text))
}

/** Check the final POST/PUT body, including metadata, without invoking user hooks. */
export function assertSceneRequestBudget(value: unknown): void {
  boundedJson(value, {
    bytes: SCENE_LIMITS.requestBytes, depth: SCENE_LIMITS.sceneDepth + 1,
    keys: SCENE_LIMITS.totalKeys + SCENE_LIMITS.objectKeys,
    nodes: SCENE_LIMITS.totalNodes + SCENE_LIMITS.objectKeys * 2, path: 'request',
  })
}
