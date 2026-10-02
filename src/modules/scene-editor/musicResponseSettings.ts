import { normalizeAudioResponseConfig, normalizeAudioResponseMode, type AudioResponseConfig, type AudioResponseTarget, type SceneAudioResponseMode } from '@shared/lib'
import { getSceneEditorModel, mergeSceneEditorBranch, type SceneData } from './sceneEditor'

// Keep metadata absence as well as values: resetting an older scene must not
// silently opt it into a new mode or add settings it never had.
export function readMusicResponseDefaults(scene: SceneData) {
  const model = getSceneEditorModel(scene)
  return {
    ...(Object.hasOwn(scene, 'audioResponse') ? { audioResponse: normalizeAudioResponseMode(scene.audioResponse) } : {}),
    ...(Object.hasOwn(scene, 'audioResponseConfig') ? { audioResponseConfig: normalizeAudioResponseConfig(scene.audioResponseConfig).config } : {}),
    minimizing_factor: model.intent.minimizing_factor,
    power_factor: model.intent.power_factor,
    base_speed: model.intent.base_speed,
    easing_speed: model.intent.easing_speed,
    volume_multiplier: model.state.volume_multiplier,
  }
}

export function restoreMusicResponseDefaults(scene: SceneData, defaults: ReturnType<typeof readMusicResponseDefaults>) {
  let next = { ...scene }
  delete next.audioResponse
  delete next.audioResponseConfig
  if (Object.hasOwn(defaults, 'audioResponse')) next.audioResponse = defaults.audioResponse
  if (Object.hasOwn(defaults, 'audioResponseConfig')) next.audioResponseConfig = normalizeAudioResponseConfig(defaults.audioResponseConfig).config
  const model = getSceneEditorModel(next)
  next = mergeSceneEditorBranch(next, 'intent', {
    ...model.intent,
    minimizing_factor: defaults.minimizing_factor,
    power_factor: defaults.power_factor,
    base_speed: defaults.base_speed,
    easing_speed: defaults.easing_speed,
  })
  return mergeSceneEditorBranch(next, 'state', { ...model.state, volume_multiplier: defaults.volume_multiplier })
}

export function changeMusicResponseMode(scene: SceneData, mode: SceneAudioResponseMode, supportedTargets?: readonly AudioResponseTarget[]): SceneData {
  const next = { ...scene, audioResponse: mode }
  if (mode !== 'mapped-v1' || Object.hasOwn(scene, 'audioResponseConfig')) return next
  const config = normalizeAudioResponseConfig(undefined).config
  // Existing scenes use size for distortion as well as scale. Start new editor
  // opt-ins gently without reinterpreting any explicitly saved mapping amounts.
  config.mappings = config.mappings.map(mapping => mapping.target === 'size' ? { ...mapping, amount: 0.1 } : mapping)
  // A first opt-in starts with the movements the compiled scene can accept.
  // Explicit saved mappings remain intact when changing modes or shaders.
  if (supportedTargets) config.mappings = config.mappings.filter(mapping => supportedTargets.includes(mapping.target))
  return { ...next, audioResponseConfig: config }
}

export function changeMusicResponseConfig(scene: SceneData, config: AudioResponseConfig): SceneData {
  return { ...scene, audioResponseConfig: normalizeAudioResponseConfig(config).config }
}
