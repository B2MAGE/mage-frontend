import type { AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { AUDIO_RESPONSE_SIGNALS, AUDIO_RESPONSE_TARGETS, type AudioResponseMode, type AudioResponseConfig, type AudioResponseTarget } from '@notrac/mage/audio-response'
import { validateSceneForPlayback, SCENE_LIMITS } from '../policy/sceneValidation'
import { isSessionId, RENDERER_PROTOCOL } from './protocol'
import { getRenderBudget } from '../policy/renderBudget'

export const PLAYBACK_VERSION = 2
export const CAPTURE_BUDGET = getRenderBudget('preview')
export const BRIDGE_LIMITS = Object.freeze({ messagesPerSecond: 90, responsesPerSecond: 45,
  captureBytes: 1_048_576, captureTimeoutMs: 5_000, maxTime: 604_800, maxHits: 16 })
export type AudioInput = { frame: AudioAnalysisFrame | null; legacyAmplitude: number; audioTime: number; playing: boolean; loaded: boolean }
export type CaptureRequest = { width: number; height: number; type: 'image/png' | 'image/jpeg' | 'image/webp'; quality: number }
export type PlaybackPayloads = {
  connect: null; ready: null; dispose: null
  load: { scene: Record<string, unknown>; profile: 'full' | 'preview' }
  loaded: null
  resize: { width: number; height: number; pixelRatio: number }
  playback: { playing: boolean }
  zoom: { factor: number }
  input: { time: number; audio: AudioInput; pointer: { x: number; y: number; down: boolean; inside?: boolean } }
  synthetic: { enabled: boolean; seed: number; tempoScale: number }
  'audio-response': { mode: AudioResponseMode; config: AudioResponseConfig | null }
  capabilities: null
  'capabilities-result': { supportedTargets: AudioResponseTarget[] }
  capture: CaptureRequest
  captured: { bytes: ArrayBuffer; type: CaptureRequest['type']; width: number; height: number }
  progress: { frames: number }
  error: { code: 'render' | 'protocol' | 'capture' }
}
export type PlaybackType = keyof PlaybackPayloads
export type PlaybackMessage<T extends PlaybackType = PlaybackType> = T extends PlaybackType ? {
  protocol: typeof RENDERER_PROTOCOL; version: typeof PLAYBACK_VERSION; session: string
  generation: number; requestId: number; type: T; payload: PlaybackPayloads[T]
} : never
export const PLAYBACK_COMMANDS = ['load', 'resize', 'playback', 'zoom', 'input', 'synthetic', 'audio-response', 'capabilities', 'capture', 'dispose'] as const
export const PLAYBACK_RESPONSES = ['ready', 'loaded', 'captured', 'capabilities-result', 'progress', 'error'] as const
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
export function isAudioResponseSettings(value: unknown): value is PlaybackPayloads['audio-response'] {
  if (!record(value, ['mode', 'config']) || !['legacy', 'transient-v1', 'mapped-v1'].includes(value.mode as string)) return false
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
    case 'connect': case 'ready': return p === null && value.generation === 0 && value.requestId === 0
    case 'dispose': case 'loaded': case 'capabilities': return p === null
    case 'audio-response': return isAudioResponseSettings(p)
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
    case 'input': return record(p, ['time', 'audio', 'pointer']) && time(p.time) && isAudioInput(p.audio)
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
    case 'error': return record(p, ['code']) && ['render', 'protocol', 'capture'].includes(p.code as string)
    default: return false
  }
}

/** Strip parent-only legacy media metadata before crossing the frame boundary. */
export function sceneForBridge(value: unknown): Record<string, unknown> {
  const valid = validateSceneForPlayback(value)
  const copy = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
  delete copy.audio; delete copy.audioPath
  if (copy.kind === 'custom' && copy.scene && typeof copy.scene === 'object') {
    delete (copy.scene as Record<string, unknown>).audio
    delete (copy.scene as Record<string, unknown>).audioPath
  }
  if (JSON.stringify(copy).length > SCENE_LIMITS.sceneBytes) throw new Error('Scene is too large.')
  return copy
}

/** A fixed one-second window bounds work without maintaining a message queue. */
export function messageRate(limit: number) {
  let start = -Infinity, count = 0
  return (now = performance.now()) => {
    if (now - start >= 1000) { start = now; count = 0 }
    return ++count <= limit
  }
}
