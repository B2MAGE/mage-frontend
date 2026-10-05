import { parseTemplateSettingsExtensions, TEMPLATE_EXTENSION_KEYS, templateOptionalEffectCount, type TemplateSettingsExtensions } from './templateSettings'
import { normalizeBuilderDocument } from './builderSchema'

/** The transport contract is also checked in under contracts/scenes for the Java API. */
export const TEMPLATE_IDS = [
  'embedded-scene-0', 'embedded-scene-1', 'embedded-scene-2', 'embedded-scene-3',
  'embedded-scene-4', 'embedded-scene-5', 'embedded-scene-6', 'embedded-scene-7',
  'embedded-scene-8', 'embedded-scene-9', 'embedded-scene-10', 'embedded-scene-11',
  'embedded-scene-12', 'embedded-scene-13', 'reaction-rings-v1', 'reaction-lantern-v1',
] as const

export type TemplateId = typeof TEMPLATE_IDS[number]
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonRecord
export type JsonRecord = { [key: string]: JsonValue }

export type TemplateSceneDocument = {
  schemaVersion: 1
  kind: 'template'
  templateId: TemplateId
  templateVersion: 1
  parameters: { scale: number; speed: number }
  settings: TemplateSettingsExtensions & {
    skybox: number
    camera: { fov: number; autoRotate: boolean; orbitSpeed: number; tilt?: number; orientationMode?: number; orientationSpeed?: number }
    bloom: { enabled: boolean; strength: number; radius: number; threshold: number }
    tint: { enabled: boolean; color: string }
  }
}

/** This envelope labels arbitrary scene source; it does not grant it trust. */
export type CustomSceneDocument = {
  schemaVersion: 1
  kind: 'custom'
  scene: JsonRecord
}

export type BuilderOperation =
  | { type: 'sphere'; radius: number }
  | { type: 'box'; width: number; height: number; depth: number }
  | { type: 'torus'; radius: number; tube: number }
  | { type: 'cylinder'; radius: number; height: number }
export type BuilderVector = { x: number; y: number; z: number }
export type BuilderBinding = {
  target: `${'position' | 'rotation' | 'scale'}.${'x' | 'y' | 'z'}` | 'material.metalness' | 'material.shininess'
  source: `${'bass' | 'mid' | 'treble' | 'overall'}-${'level' | 'hit'}` | 'pointer-x' | 'pointer-y' | 'pointer-down'
  mode: 'add' | 'replace'
  amount: number; offset: number; attack: number; release: number
}
export type BuilderObject = {
  id: string; name: string; operation: BuilderOperation
  transform: { position: BuilderVector; rotation: BuilderVector; scale: BuilderVector }
  material: { color: string; metalness: number; shininess: number }
  bindings: BuilderBinding[]
}
export type BuilderSceneDocument = {
  schemaVersion: 1; kind: 'builder'; builderVersion: 1; objects: BuilderObject[]
  parameters: TemplateSceneDocument['parameters']
  settings: TemplateSceneDocument['settings']
}
export type PlayableSceneDocument = TemplateSceneDocument | CustomSceneDocument
export type SceneDocument = PlayableSceneDocument | BuilderSceneDocument

export class SceneContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SceneContractError'
  }
}

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const documentMarkers = ['schemaVersion', 'kind', 'templateId', 'templateVersion', 'builderVersion']

/** Do not read values here: even malformed envelopes must enter strict validation. */
export function hasSceneDocumentMarkers(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  return documentMarkers.some((key) => key in value)
}

function fail(path: string, detail: string): never {
  throw new SceneContractError(`${path}: ${detail}`)
}

/** Clone data properties only. Accessors are rejected without invoking user code. */
function cloneJson(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || value === null) return fail(path, 'expected finite JSON data')
  if (ancestors.has(value)) return fail(path, 'cyclic data is not supported')
  const isArray = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    return fail(path, 'expected a plain JSON object or array')
  }
  ancestors.add(value)
  const copy: JsonValue[] | JsonRecord = isArray ? [] : {}
  const keys = Reflect.ownKeys(value)
  for (const key of keys) {
    if (typeof key !== 'string' || forbiddenKeys.has(key)) return fail(path, 'unsupported property name')
    if (isArray && key === 'length') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${path}.${key}`, 'only enumerable data properties are supported')
    }
    if (isArray) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || String(index) !== key || index >= value.length) {
        return fail(`${path}.${key}`, 'unsupported array property')
      }
      ;(copy as JsonValue[])[index] = cloneJson(descriptor.value, `${path}[${index}]`, ancestors)
    } else {
      ;(copy as JsonRecord)[key] = cloneJson(descriptor.value, `${path}.${key}`, ancestors)
    }
  }
  if (isArray && keys.length !== value.length + 1) return fail(path, 'sparse arrays are not JSON data')
  ancestors.delete(value)
  return copy
}

function object(value: JsonValue | undefined, path: string, allowed: readonly string[]): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(path, 'expected an object')
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return fail(`${path}.${key}`, 'unknown field')
  }
  return value
}

function optionalObject(value: JsonValue | undefined, path: string, allowed: readonly string[]): JsonRecord {
  return object(value === undefined ? {} : value, path, allowed)
}

function number(value: JsonValue | undefined, path: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return fail(path, `expected a finite number from ${min} to ${max}`)
  }
  return value
}

function boolean(value: JsonValue | undefined, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') return fail(path, 'expected a boolean')
  return value
}

/** Reject unknown versions instead of guessing, coercing, or falling back to custom source. */
export function parseSceneDocument(value: unknown): SceneDocument {
  const cloned = cloneJson(value, 'scene', new Set())
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return fail('scene', 'expected a scene document object')
  }
  if (cloned.schemaVersion !== 1) return fail('scene.schemaVersion', 'unsupported or missing schema version')
  if (cloned.kind === 'custom') {
    const custom = object(cloned, 'scene', ['schemaVersion', 'kind', 'scene'])
    if (custom.scene === null || typeof custom.scene !== 'object' || Array.isArray(custom.scene)) {
      return fail('scene.scene', 'expected an object')
    }
    return { schemaVersion: 1, kind: 'custom', scene: custom.scene }
  }
  if (cloned.kind === 'builder') return normalizeBuilderDocument(cloned, fail) as BuilderSceneDocument
  if (cloned.kind !== 'template') return fail('scene.kind', 'expected template, builder, or custom')
  const template = object(cloned, 'scene', [
    'schemaVersion', 'kind', 'templateId', 'templateVersion', 'parameters', 'settings',
  ])
  if (typeof template.templateId !== 'string' || !(TEMPLATE_IDS as readonly string[]).includes(template.templateId)) {
    return fail('scene.templateId', 'unknown template ID')
  }
  if (template.templateVersion !== 1) return fail('scene.templateVersion', 'unsupported or missing template version')
  const parameters = optionalObject(template.parameters, 'scene.parameters', ['scale', 'speed'])
  const settings = optionalObject(template.settings, 'scene.settings', ['skybox', 'camera', 'bloom', 'tint', ...TEMPLATE_EXTENSION_KEYS])
  const camera = optionalObject(settings.camera, 'scene.settings.camera', ['fov', 'autoRotate', 'orbitSpeed', 'tilt', 'orientationMode', 'orientationSpeed'])
  const bloom = optionalObject(settings.bloom, 'scene.settings.bloom', ['enabled', 'strength', 'radius', 'threshold'])
  const tint = optionalObject(settings.tint, 'scene.settings.tint', ['enabled', 'color'])
  const skybox = number(settings.skybox, 'scene.settings.skybox', 6, 1, 10)
  if (!Number.isInteger(skybox)) return fail('scene.settings.skybox', 'expected a catalog skybox ID from 1 to 10')
  const color = tint.color === undefined ? '#ffffff' : tint.color
  if (typeof color !== 'string' || color.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return fail('scene.settings.tint.color', 'expected a #RRGGBB color')
  }
  const orientationMode = camera.orientationMode === undefined ? undefined
    : number(camera.orientationMode, 'scene.settings.camera.orientationMode', 0, 0, 2)
  if (orientationMode !== undefined && !Number.isInteger(orientationMode)) fail('scene.settings.camera.orientationMode', 'expected an integer')
  const document: TemplateSceneDocument = {
    schemaVersion: 1,
    kind: 'template',
    templateId: template.templateId as TemplateId,
    templateVersion: 1,
    parameters: {
      scale: number(parameters.scale, 'scene.parameters.scale', 10, 1, 200),
      speed: number(parameters.speed, 'scene.parameters.speed', 1, 0, 10),
    },
    settings: {
      ...parseTemplateSettingsExtensions(settings, fail),
      skybox,
      camera: {
        fov: number(camera.fov, 'scene.settings.camera.fov', 75, 1, 179),
        autoRotate: boolean(camera.autoRotate, 'scene.settings.camera.autoRotate', true),
        orbitSpeed: number(camera.orbitSpeed, 'scene.settings.camera.orbitSpeed', 0.2, -50, 50),
        ...(camera.tilt === undefined ? {} : { tilt: number(camera.tilt, 'scene.settings.camera.tilt', 0, -2 * Math.PI, 2 * Math.PI) }),
        ...(orientationMode === undefined ? {} : { orientationMode }),
        ...(camera.orientationSpeed === undefined ? {} : { orientationSpeed: number(camera.orientationSpeed, 'scene.settings.camera.orientationSpeed', 1, 0, 10) }),
      },
      bloom: {
        enabled: boolean(bloom.enabled, 'scene.settings.bloom.enabled', false),
        strength: number(bloom.strength, 'scene.settings.bloom.strength', 1, 0, 10),
        radius: number(bloom.radius, 'scene.settings.bloom.radius', 0.2, -10, 10),
        threshold: number(bloom.threshold, 'scene.settings.bloom.threshold', 0.1, 0, 10),
      },
      tint: { enabled: boolean(tint.enabled, 'scene.settings.tint.enabled', false), color },
    },
  }
  if (templateOptionalEffectCount(document.settings) > 4) fail('scene.settings.effects', 'enable at most 4 optional effects, including bloom and tint')
  return document
}
