import type { AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { AUDIO_RESPONSE_SIGNALS, AUDIO_RESPONSE_TARGETS, type AudioResponseConfig, type AudioResponseTarget } from '@notrac/mage/audio-response'
import type { SceneAudioResponseMode } from '@shared/lib/audioResponse'
import { validateSceneForPlayback, SCENE_LIMITS } from '../policy/sceneValidation'
import { isSessionId, RENDERER_PROTOCOL } from './protocol'
import { getRenderBudget } from '../policy/renderBudget'
import { validateLiveSceneSettings, type SceneLiveSettings } from '../liveSceneSettings'
import { AUDIO_INSPECTOR_BANDS, type AudioInspectorSnapshot } from '../audioInspector'
import { BUILDER_BINDING_LIMIT, BUILDER_BINDING_RANGES, BUILDER_BINDING_RULES, BUILDER_LIMITS } from '../templates/builderDefinitions'
import { SHADER_WORKLOAD_FAILURES } from '../policy/shaderWorkloadFailure'

export const PLAYBACK_VERSION = 2
export const CAPTURE_BUDGET = getRenderBudget('preview')
export const BRIDGE_LIMITS = Object.freeze({ messagesPerSecond: 90, responsesPerSecond: 45,
  captureBytes: 1_048_576, captureTimeoutMs: 5_000, maxTime: 604_800, maxHits: 16 })
export type AudioInput = { frame: AudioAnalysisFrame | null; legacyAmplitude: number; audioTime: number; playing: boolean; loaded: boolean }
export type CaptureRequest = { width: number; height: number; type: 'image/png' | 'image/jpeg' | 'image/webp'; quality: number }
export type GraphicsDiagnostics = { contextsCreated: number; contextsDisposed: number; firstFrameMs: number | null
  geometries: number; textures: number; programs: number
  preparation?: { peakGeometries: number; peakTextures: number; peakPrograms: number
    candidatesPrepared: number; candidatesActivated: number; candidatesDiscarded: number; mode: 'parallel' | 'first-use' | null } }
export const STARTUP_PHASES = ['waiting-visible', 'compiler-download', 'compiler-startup', 'compiling', 'graphics-download', 'graphics-startup'] as const
export type StartupPhase = typeof STARTUP_PHASES[number]
export const PLAYBACK_ERRORS = ['render', 'protocol', 'capture', 'compile', 'compiler-download', 'graphics-download',
  'compiler-startup', 'compile-timeout', 'invalid-output', 'graphics-startup', 'context-lost', 'interrupted', ...SHADER_WORKLOAD_FAILURES] as const
export const CANDIDATE_ERRORS = ['compile', 'compiler-download', 'graphics-download', 'compiler-startup', 'compile-timeout',
  'invalid-output', 'graphics-startup', 'interrupted', ...SHADER_WORKLOAD_FAILURES] as const
export type PlaybackPayloads = {
  connect: null | { startupPhases: true; workloadErrors?: true; stagedScenes?: true }; ready: null; dispose: null
  load: { scene: Record<string, unknown>; profile: 'full' | 'preview' }
  loaded: null
  prepared: null
  activate: null
  'candidate-error': { code: typeof CANDIDATE_ERRORS[number]; retained: boolean }
  'cancel-load': null
  'load-phase': { phase: StartupPhase; attempt: 0 | 1 }
  resize: { width: number; height: number; pixelRatio: number }
  playback: { playing: boolean }
  zoom: { factor: number }
  input: { time: number; audio: AudioInput; audioEpoch?: number; pointer: { x: number; y: number; down: boolean; inside?: boolean } }
  synthetic: { enabled: boolean; seed: number; tempoScale: number }
  'audio-response': { mode: SceneAudioResponseMode; config: AudioResponseConfig | null }
  'scene-settings': SceneLiveSettings
  capabilities: null
  'capabilities-result': { supportedTargets: AudioResponseTarget[] }
  'audio-inspector': null
  'audio-inspector-result': AudioInspectorSnapshot | null
  'graphics-diagnostics': null
  'graphics-diagnostics-result': GraphicsDiagnostics | null
  capture: CaptureRequest
  captured: { bytes: ArrayBuffer; type: CaptureRequest['type']; width: number; height: number }
  progress: { frames: number }
  error: { code: typeof PLAYBACK_ERRORS[number] }
}
export type PlaybackType = keyof PlaybackPayloads
export type PlaybackMessage<T extends PlaybackType = PlaybackType> = T extends PlaybackType ? {
  protocol: typeof RENDERER_PROTOCOL; version: typeof PLAYBACK_VERSION; session: string
  generation: number; requestId: number; type: T; payload: PlaybackPayloads[T]
} : never
export const PLAYBACK_COMMANDS = ['load', 'cancel-load', 'activate', 'resize', 'playback', 'zoom', 'input', 'synthetic', 'audio-response', 'scene-settings', 'capabilities', 'audio-inspector', 'graphics-diagnostics', 'capture', 'dispose'] as const
export const PLAYBACK_RESPONSES = ['ready', 'load-phase', 'prepared', 'loaded', 'candidate-error', 'captured', 'capabilities-result', 'audio-inspector-result', 'graphics-diagnostics-result', 'progress', 'error'] as const
export function playbackMessage<T extends PlaybackType>(type: T, session: string, generation: number,
  requestId: number, payload: PlaybackPayloads[T]): PlaybackMessage<T> {
  return { protocol: RENDERER_PROTOCOL, version: PLAYBACK_VERSION, type, session, generation, requestId, payload } as PlaybackMessage<T>
}
export function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  const names = Reflect.ownKeys(value)
  return names.length === keys.length && names.every(key => typeof key === 'string' && keys.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'))
}
export const numberIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number'
  && Number.isFinite(value) && value >= min && value <= max
const uint = (v: unknown) => numberIn(v, 0, Number.MAX_SAFE_INTEGER) && Number.isSafeInteger(v)
const time = (v: unknown) => numberIn(v, 0, BRIDGE_LIMITS.maxTime)
const bool = (v: unknown) => typeof v === 'boolean'
const unit = (v: unknown) => numberIn(v, 0, 1)
function isGraphicsDiagnostics(value: unknown): value is GraphicsDiagnostics | null {
  if (value === null) return true
  const fields = ['contextsCreated', 'contextsDisposed', 'firstFrameMs', 'geometries', 'textures', 'programs']
  if (!record(value, fields) && !record(value, [...fields, 'preparation'])) return false
  const count = (value: unknown, limit: number) => numberIn(value, 0, limit) && Number.isInteger(value)
  if (Object.hasOwn(value, 'preparation')) {
    const prepared = value.preparation
    if (!record(prepared, ['peakGeometries', 'peakTextures', 'peakPrograms', 'candidatesPrepared', 'candidatesActivated', 'candidatesDiscarded', 'mode'])
      || !count(prepared.peakGeometries, 100_000) || !count(prepared.peakTextures, 100_000) || !count(prepared.peakPrograms, 100_000)
      || !count(prepared.candidatesPrepared, 1_000_000) || !count(prepared.candidatesActivated, 1_000_000)
      || !count(prepared.candidatesDiscarded, 1_000_000) || ![null, 'parallel', 'first-use'].includes(prepared.mode as string | null)) return false
  }
  return count(value.contextsCreated, 1_000_000) && count(value.contextsDisposed, 1_000_000)
    && (value.contextsDisposed as number) <= (value.contextsCreated as number)
    && (value.firstFrameMs === null || numberIn(value.firstFrameMs, 0, 120_000))
    && count(value.geometries, 100_000) && count(value.textures, 100_000) && count(value.programs, 100_000)
}
function isAudioInspector(value: unknown): value is AudioInspectorSnapshot | null {
  if (value === null) return true
  if (!record(value, ['mode', 'source', 'playing', 'audioLoaded', 'levels', 'hits', 'sceneOutputs', 'bindings', 'driverSignals'])
    || !['legacy', 'mapped-v1'].includes(value.mode as string)
    || !['audio', 'synthetic', 'none'].includes(value.source as string) || !bool(value.playing) || !bool(value.audioLoaded)) return false
  const bands = (item: unknown) => record(item, AUDIO_INSPECTOR_BANDS) && Object.values(item).every(unit)
  if (value.levels !== null && !bands(value.levels) || !bands(value.hits)) return false
  const outputs = value.sceneOutputs
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return false
  const targets = Reflect.ownKeys(outputs)
  if (!record(outputs, targets.filter((key): key is string => typeof key === 'string')) || targets.length > AUDIO_RESPONSE_TARGETS.length
    || !targets.every(target => AUDIO_RESPONSE_TARGETS.includes(target as AudioResponseTarget)
      && numberIn(outputs[target as string], -1_000_000, 1_000_000))) return false
  const sources = BUILDER_BINDING_RULES.source.enum as readonly string[]
  if (!Array.isArray(value.bindings) || value.bindings.length > BUILDER_LIMITS.objects * BUILDER_BINDING_LIMIT
    || !Array.isArray(value.driverSignals) || value.driverSignals.length > sources.length) return false
  const addresses = new Set<string>(), signals = new Set<string>()
  return Array.from(value.bindings).every(binding => {
    if (!record(binding, ['objectId', 'target', 'source', 'signal', 'value']) || typeof binding.objectId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(binding.objectId)
      || typeof binding.target !== 'string' || !Object.hasOwn(BUILDER_BINDING_RANGES, binding.target)
      || typeof binding.source !== 'string' || !sources.includes(binding.source)
      || !numberIn(binding.signal, binding.source === 'pointer-x' || binding.source === 'pointer-y' ? -1 : 0, 1)) return false
    const range = BUILDER_BINDING_RANGES[binding.target as keyof typeof BUILDER_BINDING_RANGES]
    const address = `${binding.objectId}:${binding.target}`
    if (addresses.has(address) || !numberIn(binding.value, range.minimum, range.maximum)) return false
    addresses.add(address); return true
  }) && Array.from(value.driverSignals).every(signal => {
    if (!record(signal, ['source', 'value']) || typeof signal.source !== 'string' || !sources.includes(signal.source)
      || signals.has(signal.source) || !numberIn(signal.value, signal.source === 'pointer-x' || signal.source === 'pointer-y' ? -1 : 0, 1)) return false
    signals.add(signal.source); return true
  })
}
export function isAudioResponseSettings(value: unknown): value is PlaybackPayloads['audio-response'] {
  if (!record(value, ['mode', 'config']) || !['legacy', 'mapped-v1'].includes(value.mode as string)) return false
  const config = value.config
  if (config === null) return true
  if (!record(config, ['version', 'sensitivity', 'mappings']) || config.version !== 1 || !numberIn(config.sensitivity, 0.1, 4)
    || !Array.isArray(config.mappings) || config.mappings.length > 6) return false
  const targets = new Set()
  return config.mappings.every(mapping => {
    if (!record(mapping, ['target', 'source', 'amount', 'attack', 'release'])
      || !AUDIO_RESPONSE_TARGETS.includes(mapping.target as AudioResponseTarget)
      || !AUDIO_RESPONSE_SIGNALS.includes(mapping.source as typeof AUDIO_RESPONSE_SIGNALS[number])
      || !numberIn(mapping.amount, 0, 4) || !numberIn(mapping.attack, 0, 2) || !numberIn(mapping.release, 0, 5)
      || targets.has(mapping.target)) return false
    targets.add(mapping.target)
    return true
  })
}
export const rasterType = (v: unknown): v is CaptureRequest['type'] => ['image/png', 'image/jpeg', 'image/webp'].includes(v as string)
export function isAudioInput(value: unknown): value is AudioInput {
  if (!record(value, ['frame', 'legacyAmplitude', 'audioTime', 'playing', 'loaded'])
    || !unit(value.legacyAmplitude) || !time(value.audioTime) || !bool(value.playing) || !bool(value.loaded)
    || (value.playing && !value.loaded)) return false
  const f = value.frame
  return f === null || (record(f, ['sequence', 'time', 'levels', 'hits']) && uint(f.sequence) && time(f.time)
    && f.time <= value.audioTime && value.audioTime - f.time <= 1
    && record(f.levels, ['bass', 'mid', 'treble', 'overall']) && Object.values(f.levels).every(unit)
    && Array.isArray(f.hits) && f.hits.length <= BRIDGE_LIMITS.maxHits && f.hits.every(h =>
      record(h, ['band', 'time', 'strength']) && ['bass', 'mid', 'treble', 'overall'].includes(h.band as string)
      && time(h.time) && h.time <= (f.time as number) && (f.time as number) - h.time <= 1 && unit(h.strength)))
}
export function isPlaybackMessage(value: unknown, allowed: readonly string[]): value is PlaybackMessage {
  if (!record(value, ['protocol', 'version', 'session', 'generation', 'requestId', 'type', 'payload'])
    || value.protocol !== RENDERER_PROTOCOL || value.version !== PLAYBACK_VERSION || !isSessionId(value.session)
    || !uint(value.generation) || !uint(value.requestId) || typeof value.type !== 'string' || !allowed.includes(value.type)) return false
  const p = value.payload
  switch (value.type) {
    case 'connect': return (p === null || ((record(p, ['startupPhases'])
      || record(p, ['startupPhases', 'workloadErrors']) && p.workloadErrors === true
      || record(p, ['startupPhases', 'stagedScenes']) && p.stagedScenes === true
      || record(p, ['startupPhases', 'workloadErrors', 'stagedScenes']) && p.workloadErrors === true && p.stagedScenes === true) && p.startupPhases === true))
      && value.generation === 0 && value.requestId === 0
    case 'ready': return p === null && value.generation === 0 && value.requestId === 0
    case 'dispose': case 'loaded': case 'prepared': case 'activate': case 'capabilities': case 'audio-inspector': case 'graphics-diagnostics': case 'cancel-load': return p === null
    case 'candidate-error': return record(p, ['code', 'retained']) && CANDIDATE_ERRORS.includes(p.code as typeof CANDIDATE_ERRORS[number]) && bool(p.retained)
    case 'audio-inspector-result': return isAudioInspector(p)
    case 'graphics-diagnostics-result': return isGraphicsDiagnostics(p)
    case 'load-phase': return record(p, ['phase', 'attempt']) && STARTUP_PHASES.includes(p.phase as StartupPhase)
      && (p.attempt === 0 || p.attempt === 1) && numberIn(value.generation, 1, Number.MAX_SAFE_INTEGER)
      && numberIn(value.requestId, 1, Number.MAX_SAFE_INTEGER)
    case 'audio-response': return isAudioResponseSettings(p)
    case 'scene-settings':
      try { validateLiveSceneSettings(p); return true } catch { return false }
    case 'capabilities-result': return record(p, ['supportedTargets']) && Array.isArray(p.supportedTargets)
      && p.supportedTargets.length <= 6 && new Set(p.supportedTargets).size === p.supportedTargets.length
      && p.supportedTargets.every(target => AUDIO_RESPONSE_TARGETS.includes(target as AudioResponseTarget))
    case 'load':
      if (!record(p, ['scene', 'profile']) || !['preview', 'full'].includes(p.profile as string) || value.generation === 0) return false
      try { validateSceneForPlayback(p.scene); return true } catch { return false }
    case 'resize': return record(p, ['width', 'height', 'pixelRatio']) && numberIn(p.width, 1, 8192)
      && numberIn(p.height, 1, 8192) && numberIn(p.pixelRatio, 0.25, 1.5)
    case 'playback': return record(p, ['playing']) && bool(p.playing)
    case 'zoom': return record(p, ['factor']) && numberIn(p.factor, 0.4, 2.5)
    case 'synthetic': return record(p, ['enabled', 'seed', 'tempoScale']) && bool(p.enabled)
      && numberIn(p.seed, 0, 4294967295) && Number.isInteger(p.seed) && numberIn(p.tempoScale, 0.25, 4)
    case 'input': return (record(p, ['time', 'audio', 'pointer'])
      || (record(p, ['time', 'audio', 'audioEpoch', 'pointer']) && uint(p.audioEpoch))) && time(p.time) && isAudioInput(p.audio)
      && (record(p.pointer, ['x', 'y', 'down']) || (record(p.pointer, ['x', 'y', 'down', 'inside']) && bool(p.pointer.inside)))
      && numberIn(p.pointer.x, -1, 1) && numberIn(p.pointer.y, -1, 1) && bool(p.pointer.down)
    case 'capture': return record(p, ['width', 'height', 'type', 'quality']) && rasterType(p.type)
      && numberIn(p.width, 1, CAPTURE_BUDGET.maxLongestEdge) && Number.isInteger(p.width) && numberIn(p.height, 1, CAPTURE_BUDGET.maxLongestEdge)
      && Number.isInteger(p.height) && p.width * p.height <= CAPTURE_BUDGET.maxRenderPixels && unit(p.quality)
    case 'captured': return record(p, ['bytes', 'type', 'width', 'height']) && p.bytes instanceof ArrayBuffer
      && p.bytes.byteLength > 0 && p.bytes.byteLength <= BRIDGE_LIMITS.captureBytes && rasterType(p.type)
      && numberIn(p.width, 1, CAPTURE_BUDGET.maxLongestEdge) && Number.isInteger(p.width) && numberIn(p.height, 1, CAPTURE_BUDGET.maxLongestEdge)
      && Number.isInteger(p.height) && p.width * p.height <= CAPTURE_BUDGET.maxRenderPixels
    case 'progress': return record(p, ['frames']) && uint(p.frames)
    case 'error': return record(p, ['code']) && PLAYBACK_ERRORS.includes(p.code as typeof PLAYBACK_ERRORS[number])
    default: return false
  }
}

/** Strip parent-owned media metadata before crossing the frame boundary. */
export function sceneForBridge(value: unknown): Record<string, unknown> {
  const valid = validateSceneForPlayback(value)
  const copy = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
  if (copy.kind === 'custom' && copy.scene && typeof copy.scene === 'object') {
    delete (copy.scene as Record<string, unknown>).audioPath
  }
  if (JSON.stringify(copy).length > SCENE_LIMITS.sceneBytes) throw new Error('Scene is too large.')
  return copy
}

/** A fixed one-second window bounds work without maintaining a message queue. */
export function messageRate(limit: number) {
  let start = -Infinity, count = 0
  return (now = performance.now(), reserve = 0) => {
    if (now - start >= 1000) { start = now; count = 0 }
    if (count >= limit - reserve) return false
    count++; return true
  }
}
