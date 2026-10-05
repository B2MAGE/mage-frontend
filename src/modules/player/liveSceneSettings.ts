import { assertSceneRequestBudget, validateSceneForPlayback } from './policy/sceneValidation'
import { resolveSceneForPlayback } from './templates/resolveScene'

type Vector = { x: number; y: number; z: number }
export type SceneLiveSettings = {
  visualizer: { scale: number }
  controls: { position0: Vector; target0: Vector; zoom0: number }
  intent: {
    time_multiplier: number; minimizing_factor: number; power_factor: number; pointerDownMultiplier: number
    base_speed: number; easing_speed: number; camTilt: number; camOrientationMode: number
    camOrientationSpeed: number; autoRotate: boolean; autoRotateSpeed: number; fov: number
  }
  state: { volume_multiplier: number }
  fx: {
    passOrder: string[]
    bloom: { enabled: boolean; strength: number; radius: number; threshold: number }
    toneMapping: { method: number; exposure: number }
    passes: {
      rgbShift: boolean; dot: boolean; technicolor: boolean; luminosity: boolean; afterImage: boolean
      sobel: boolean; glitch: boolean; colorify: boolean; halftone: boolean; gammaCorrection: boolean
      kaleid: boolean; bleachBypass: boolean; toon: boolean; outputPass: boolean
    }
    params: {
      rgbShift: { amount: number; angle: number }; afterImage: { damp: number }
      colorify: { color: string }; kaleid: { sides: number; angle: number }
    }
  }
}
type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
export type SceneLiveSettingsPatch = DeepPartial<SceneLiveSettings>

// Defaults match a freshly loaded engine with the platform's optional-effect
// defaults applied. Template versions resolve their own defaults before this.
const defaults: SceneLiveSettings = {
  visualizer: { scale: 10 },
  controls: { position0: { x: 0, y: 0, z: 5.5 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 },
  intent: { time_multiplier: 1, minimizing_factor: 0.8, power_factor: 8, pointerDownMultiplier: 0,
    base_speed: 0.2, easing_speed: 0.6, camTilt: 0, camOrientationMode: 0, camOrientationSpeed: 1,
    autoRotate: true, autoRotateSpeed: 0.2, fov: 75 },
  state: { volume_multiplier: 0 },
  fx: {
    passOrder: ['glitchPass', 'bloom', 'RGBShift', 'dotShader', 'technicolorShader', 'luminosityShader',
      'afterImagePass', 'sobelShader', 'colorifyShader', 'halftonePass', 'gammaCorrectionShader',
      'kaleidoShader', 'copyShader', 'bleachBypassShader', 'toonShader', 'outputPass'],
    bloom: { enabled: false, strength: 1, radius: 0.2, threshold: 0.1 },
    toneMapping: { method: 0, exposure: 1.5 },
    passes: { rgbShift: false, dot: false, technicolor: false, luminosity: false, afterImage: false,
      sobel: false, glitch: false, colorify: false, halftone: false, gammaCorrection: false,
      kaleid: false, bleachBypass: false, toon: false, outputPass: true },
    params: { rgbShift: { amount: 0.005, angle: 0 }, afterImage: { damp: 0.96 },
      colorify: { color: '#ffffff' }, kaleid: { sides: 6, angle: 0 } },
  },
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function completeShape(value: unknown, shape: unknown): boolean {
  if (Array.isArray(shape)) return Array.isArray(value)
  if (!isObject(shape)) return typeof value === typeof shape
  if (!isObject(value)) return false
  const keys = Object.keys(shape)
  return Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key) && completeShape(value[key], shape[key]))
}

/** Full bounded snapshots make rapid edits to separate controls safe to coalesce. */
export function validateLiveSceneSettings(value: unknown): SceneLiveSettings {
  // Inspect descriptors before reading/spreading fields: no getters or toJSON.
  assertSceneRequestBudget(value)
  if (!completeShape(value, defaults) || JSON.stringify(value).length > 8192) {
    throw new Error('Unsupported live scene settings.')
  }
  const settings = value as SceneLiveSettings
  // Reuse the scene contract's numeric, enum, color, uniqueness and effect-count
  // policy. The fixed source is validation scaffolding and is never executed.
  const document = validateSceneForPlayback({ ...settings,
    visualizer: { shader: 'sphere(1)', ...settings.visualizer } })
  if (document.kind !== 'custom') throw new Error('Unsupported live scene settings.')
  const copy = document.scene
  delete (copy.visualizer as Record<string, unknown>).shader
  return copy as unknown as SceneLiveSettings
}

function selectWithDefaults(shape: unknown, source: unknown): unknown {
  if (Array.isArray(shape)) return Array.isArray(source) ? [...source] : [...shape]
  if (!isObject(shape)) return source === undefined ? shape : source
  return Object.fromEntries(Object.entries(shape).map(([key, fallback]) =>
    [key, selectWithDefaults(fallback, isObject(source) ? source[key] : undefined)]))
}

/** Validate the entire document before selecting fields; never hide forbidden data. */
export function extractLiveSceneSettings(scene: unknown): SceneLiveSettings {
  const resolved = resolveSceneForPlayback(validateSceneForPlayback(scene)).engineScene
  return validateLiveSceneSettings(selectWithDefaults(defaults, resolved))
}

/** Only changed leaves reach the engine, preserving camera movement by the viewer. */
export function diffLiveSceneSettings(before: SceneLiveSettings, next: SceneLiveSettings): SceneLiveSettingsPatch {
  const diff = (old: unknown, value: unknown): unknown => {
    if (Array.isArray(value)) return JSON.stringify(old) === JSON.stringify(value) ? undefined : [...value]
    if (!isObject(value)) return old === value ? undefined : value
    const entries = Object.entries(value).flatMap(([key, child]) => {
      const changed = diff(isObject(old) ? old[key] : undefined, child)
      return changed === undefined ? [] : [[key, changed]]
    })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return (diff(before, next) ?? {}) as SceneLiveSettingsPatch
}

/** The validated remainder identifies work that still requires a complete load. */
export function sceneStructuralContent(scene: unknown) {
  const document = validateSceneForPlayback(scene)
  const resolved = resolveSceneForPlayback(document).engineScene
  // The resolver returns new data from validation, never caller-owned objects.
  // Strip only audited leaves. Any future scene-contract fields stay structural
  // until explicitly added to the live settings contract.
  const strip = (value: Record<string, unknown>, shape: Record<string, unknown>) => {
    for (const [key, live] of Object.entries(shape)) {
      if (isObject(live) && isObject(value[key])) {
        strip(value[key], live)
        if (!Object.keys(value[key]).length) delete value[key]
      } else if (!isObject(live)) delete value[key]
    }
  }
  strip(resolved, defaults)
  for (const key of ['audioResponse', 'audioResponseConfig']) delete resolved[key]
  return { kind: document.kind, ...(document.kind === 'template'
    ? { templateId: document.templateId, templateVersion: document.templateVersion } : {}), scene: resolved }
}
