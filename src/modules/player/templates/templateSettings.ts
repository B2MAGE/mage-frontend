import policy from '../../../../contracts/scenes/scene-limits.v1.json'
import type { JsonRecord, JsonValue } from './sceneContract'

type Vector = { x: number; y: number; z: number }
type PassFlag = 'rgbShift' | 'dot' | 'technicolor' | 'luminosity' | 'afterImage' | 'sobel'
  | 'glitch' | 'halftone' | 'gammaCorrection' | 'kaleid' | 'bleachBypass' | 'toon' | 'outputPass'
type PassId = 'glitchPass' | 'bloom' | 'RGBShift' | 'dotShader' | 'technicolorShader'
  | 'luminosityShader' | 'afterImagePass' | 'sobelShader' | 'colorifyShader' | 'halftonePass'
  | 'gammaCorrectionShader' | 'kaleidoShader' | 'copyShader' | 'bleachBypassShader' | 'toonShader' | 'outputPass'
type AudioMapping = {
  target: 'size' | 'bass' | 'mid' | 'treble' | 'audioLevel' | 'audioHit'
  source: 'bass-level' | 'mid-level' | 'treble-level' | 'overall-level' | 'bass-hit' | 'mid-hit' | 'treble-hit' | 'overall-hit'
  amount?: number; attack?: number; release?: number
}

/** Optional data-only additions. Omitting them preserves the shipped v1 appearance. */
export type TemplateSettingsExtensions = {
  controls?: { position0: Vector; target0: Vector; zoom0: number }
  motion?: Partial<{ minimizing_factor: number; power_factor: number; pointerDownMultiplier: number; base_speed: number; easing_speed: number }>
  effects?: {
    passOrder?: PassId[]
    toneMapping?: Partial<{ method: number; exposure: number }>
    passes?: Partial<Record<PassFlag, boolean>>
    params?: {
      rgbShift?: Partial<{ amount: number; angle: number }>
      afterImage?: Partial<{ damp: number }>
      kaleid?: Partial<{ sides: number; angle: number }>
    }
  }
  state?: Partial<{ size: number; pointerDown: number; currPointerDown: number; currAudio: number; time: number; volume_multiplier: number }>
  audioResponse?: 'legacy' | 'mapped-v1'
  audioResponseConfig?: { version: 1; sensitivity?: number; mappings?: AudioMapping[] }
}

type Rule = {
  type: string; fields?: Record<string, Rule>; required?: string[]; items?: Rule
  maxItems?: number; unique?: boolean; uniqueBy?: string; minimum?: number; maximum?: number; values?: JsonValue[]
}
const fields = policy.scene.fields
const passes = Object.fromEntries(Object.entries(fields.fx.fields.passes.fields).filter(([key]) => key !== 'colorify'))
const params = Object.fromEntries(Object.entries(fields.fx.fields.params.fields).filter(([key]) => key !== 'colorify'))
// Select individual policy branches. Source, assets, renderer settings, and
// canonical legacy aliases are deliberately absent from these extension rules.
const rules: Record<keyof TemplateSettingsExtensions, Rule> = {
  controls: fields.controls,
  motion: { type: 'object', fields: {
    minimizing_factor: fields.intent.fields.minimizing_factor,
    power_factor: fields.intent.fields.power_factor,
    pointerDownMultiplier: fields.intent.fields.pointerDownMultiplier,
    base_speed: fields.intent.fields.base_speed,
    easing_speed: fields.intent.fields.easing_speed,
  } },
  effects: { type: 'object', fields: {
    passOrder: fields.fx.fields.passOrder, toneMapping: fields.fx.fields.toneMapping,
    passes: { type: 'object', fields: passes }, params: { type: 'object', fields: params },
  } },
  state: fields.state,
  audioResponse: fields.audioResponse,
  audioResponseConfig: fields.audioResponseConfig,
}

export const TEMPLATE_EXTENSION_KEYS = Object.keys(rules)

/** Input has already been cloned as finite plain JSON without invoking getters. */
export function parseTemplateSettingsExtensions(settings: JsonRecord, fail: (path: string, detail: string) => never): TemplateSettingsExtensions {
  const validate = (value: JsonValue, rule: Rule, path: string): void => {
    if (rule.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
      const data = value as JsonRecord
      for (const [key, child] of Object.entries(data)) {
        const childRule = Object.hasOwn(rule.fields ?? {}, key) ? rule.fields![key] : undefined
        if (!childRule) fail(`${path}.${key}`, 'unknown field')
        validate(child, childRule!, `${path}.${key}`)
      }
      for (const key of rule.required ?? []) if (!Object.hasOwn(data, key)) fail(`${path}.${key}`, 'required field')
    } else if (rule.type === 'array') {
      if (!Array.isArray(value) || value.length > rule.maxItems!) fail(path, `expected an array with at most ${rule.maxItems} items`)
      const seen = new Set<string>()
      ;(value as JsonValue[]).forEach((item, index) => {
        validate(item, rule.items!, `${path}[${index}]`)
        const identity = JSON.stringify(rule.uniqueBy ? (item as JsonRecord)[rule.uniqueBy] : item)
        if ((rule.unique || rule.uniqueBy) && seen.has(identity)) fail(`${path}[${index}]`, 'duplicate items are not allowed')
        seen.add(identity)
      })
    } else if (rule.type === 'number' || rule.type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.minimum! || value > rule.maximum!
        || (rule.type === 'integer' && !Number.isInteger(value))) fail(path, `expected ${rule.type} from ${rule.minimum} to ${rule.maximum}`)
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') fail(path, 'expected a boolean')
    } else if (rule.type === 'enum') {
      if (!rule.values!.includes(value)) fail(path, 'unsupported value')
    } else throw new Error('Unsupported template settings rule')
  }
  const result: JsonRecord = {}
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.hasOwn(settings, key)) continue
    validate(settings[key], rule, `scene.settings.${key}`)
    result[key] = settings[key]
  }
  return result as TemplateSettingsExtensions
}

export function templateOptionalEffectCount(settings: {
  bloom: { enabled: boolean }; tint: { enabled: boolean }; effects?: TemplateSettingsExtensions['effects']
}): number {
  let count = Number(settings.bloom.enabled) + Number(settings.tint.enabled)
  for (const flag of policy.optionalEffectFlags) {
    if (flag !== 'colorify' && settings.effects?.passes?.[flag as PassFlag] === true) count++
  }
  return count
}
