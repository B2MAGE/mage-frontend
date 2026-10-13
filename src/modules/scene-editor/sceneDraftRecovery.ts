import type { SceneData } from './sceneEditor'
import sceneSchema from '../../../contracts/scenes/scene-v1.schema.json'
import { listSceneTemplates, parseSceneDocument, validateBuilderComposition, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { builderDesignKey } from './builderDesign'

/** A library source is editor context only; scenes always contain their own full document. */
export type PersonalTemplateSource = {
  templateId: number
  name: string
  revision: number
  documentKey: string
}

export type SceneDraftSnapshot = {
  name: string
  description: string
  sceneData: SceneData
  sceneDataText: string
  selectedTagIds: number[]
  selectedBuilderObjectId: string | null
  /** Editor-only origin; it is not part of the saved scene or a reusable template. */
  templateSourceId?: TemplateId | null
  personalTemplateSource?: PersonalTemplateSource | null
}

export type SceneDraftSaveContext = { savedSceneId: number | null; expectedRevision: number | null; saveNeedsReview: boolean }
export type SceneDraftRecord = {
  version: 1
  savedAt: number
  baseFingerprint: string
  snapshot: SceneDraftSnapshot
  saveContext: SceneDraftSaveContext
}
export type SceneDraftCandidate = SceneDraftRecord & { baseChanged: boolean }
export type SceneDraftStatus = {
  kind: 'idle' | 'saved' | 'available' | 'conflict' | 'error'
  message: string
}

// One bounded, current-format record per account and editor destination.
export const SCENE_DRAFT_MAX_CHARACTERS = 1_000_000
export const SCENE_DRAFT_DEBOUNCE_MS = 400
const emptyContext: SceneDraftSaveContext = { savedSceneId: null, expectedRevision: null, saveNeedsReview: false }

export function sceneDraftStorageKey(userId: string | number, sceneId: number | null) {
  return `mage:scene-draft:v1:${encodeURIComponent(String(userId))}:${sceneId === null ? 'create' : `edit:${sceneId}`}`
}

/** Selection is recoverable UI state, but selecting an object does not dirty a scene. */
export function sceneDraftFingerprint(snapshot: SceneDraftSnapshot) {
  return JSON.stringify({ name: snapshot.name, description: snapshot.description,
    sceneData: snapshot.sceneData, sceneDataText: snapshot.sceneDataText, selectedTagIds: snapshot.selectedTagIds,
    ...(snapshot.templateSourceId ? { templateSourceId: snapshot.templateSourceId } : {}),
    ...(snapshot.personalTemplateSource ? { personalTemplateSource: snapshot.personalTemplateSource } : {}) })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

type ShapeRule = {
  $ref?: string
  type?: string
  const?: unknown
  enum?: unknown[]
  anyOf?: ShapeRule[]
  properties?: Record<string, ShapeRule>
  required?: string[]
  additionalProperties?: boolean
  items?: ShapeRule
  default?: unknown
}

/** Check the existing current schema's shapes, retaining repairable scalar range errors. */
function matchesEditorShape(value: unknown, rule: ShapeRule): boolean {
  if (rule.$ref) {
    const target = rule.$ref.split('/').slice(1).reduce<unknown>((current, key) =>
      isObject(current) ? current[key] : undefined, sceneSchema)
    return isObject(target) && matchesEditorShape(value, target)
  }
  if (rule.anyOf) return rule.anyOf.some(branch => matchesEditorShape(value, branch))
  if ('const' in rule && value !== rule.const) return false
  if (rule.enum && typeof value === 'string' && !rule.enum.includes(value)) return false
  if (rule.type === 'object') {
    if (!isObject(value)) return false
    const fields = rule.properties ?? {}
    if (rule.required?.some(key => !(key in value))) return false
    // Editor documents have already materialized the contract defaults; missing these
    // branches (for example Builder arrangements) would be unsafe to hand to controls.
    if (Object.entries(fields).some(([key, child]) => 'default' in child && !(key in value))) return false
    return Object.entries(value).every(([key, child]) => key in fields
      ? matchesEditorShape(child, fields[key]) : rule.additionalProperties !== false)
  }
  if (rule.type === 'array') return Array.isArray(value) && (!rule.items || value.every(child => matchesEditorShape(child, rule.items!)))
  if (rule.type === 'number' || rule.type === 'integer') return typeof value === 'number' && Number.isFinite(value)
  if (rule.type === 'boolean' || rule.type === 'string') return typeof value === rule.type
  return true
}

function isCurrentSceneData(value: unknown): value is SceneData {
  if (!isObject(value)) return false
  const markers = ['schemaVersion', 'kind', 'builderVersion', 'templateId', 'templateVersion']
  if (markers.some(key => key in value)) {
    if (value.kind !== 'builder' && value.kind !== 'template') return false
    if (!matchesEditorShape(value, sceneSchema.$defs[value.kind] as ShapeRule)) return false
    if (value.kind === 'builder') {
      try {
        // Scalar errors remain editable; broken group references cannot enter a tree UI.
        validateBuilderComposition(value as BuilderSceneDocument, () => { throw new Error('Invalid group structure') })
      } catch { return false }
    }
  } else if (!isObject(value.visualizer) || typeof value.visualizer.shader !== 'string') return false
  // Recovery preserves authored validation errors. Publishing still uses the normal validator.
  const pending = [{ value: value as unknown, depth: 0 }]
  while (pending.length) {
    const entry = pending.pop()!
    if (entry.depth > 64) return false
    if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) return false
    if (entry.value && typeof entry.value === 'object') {
      for (const [key, child] of Object.entries(entry.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) return false
        pending.push({ value: child, depth: entry.depth + 1 })
      }
    }
  }
  return true
}

export function parseSceneDraftRecord(raw: string): SceneDraftRecord | null {
  if (raw.length > SCENE_DRAFT_MAX_CHARACTERS) return null
  try {
    const record: unknown = JSON.parse(raw)
    if (!isObject(record) || record.version !== 1 || typeof record.savedAt !== 'number'
      || !Number.isFinite(record.savedAt) || record.savedAt < 0 || typeof record.baseFingerprint !== 'string'
      || !isObject(record.snapshot) || !isObject(record.saveContext)) return null
    const { snapshot, saveContext } = record
    const source = snapshot.personalTemplateSource
    if (source !== undefined && source !== null && (!isObject(source)
      || !Number.isSafeInteger(source.templateId) || Number(source.templateId) < 1
      || !Number.isSafeInteger(source.revision) || Number(source.revision) < 0
      || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100
      || typeof source.documentKey !== 'string')) return null
    if (isObject(source)) {
      const design = parseSceneDocument(JSON.parse(source.documentKey as string))
      if (design.kind !== 'builder') return null
      source.documentKey = builderDesignKey(design)
    }
    if (typeof snapshot.name !== 'string' || typeof snapshot.description !== 'string'
      || typeof snapshot.sceneDataText !== 'string' || !isCurrentSceneData(snapshot.sceneData)
      || !Array.isArray(snapshot.selectedTagIds) || snapshot.selectedTagIds.length > 1000
      || !snapshot.selectedTagIds.every(id => Number.isSafeInteger(id) && id > 0)
      || !(snapshot.selectedBuilderObjectId === null || typeof snapshot.selectedBuilderObjectId === 'string')
      || !(snapshot.templateSourceId === undefined || snapshot.templateSourceId === null
        || (typeof snapshot.templateSourceId === 'string' && listSceneTemplates().some(template => template.templateId === snapshot.templateSourceId)))
      || !(saveContext.savedSceneId === null || (Number.isSafeInteger(saveContext.savedSceneId) && Number(saveContext.savedSceneId) > 0))
      || !(saveContext.expectedRevision === null || (Number.isSafeInteger(saveContext.expectedRevision) && Number(saveContext.expectedRevision) >= 0))
      || typeof saveContext.saveNeedsReview !== 'boolean') return null
    return record as SceneDraftRecord
  } catch {
    return null
  }
}

type RecoveryInput = {
  snapshot: SceneDraftSnapshot
  baseFingerprint: string
  saveContext?: SceneDraftSaveContext
}
type RecoveryView = { candidate: SceneDraftCandidate | null; status: SceneDraftStatus; requiresResolution: boolean }
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Small controller keeps debounce, unload, and async-save comparisons on the same latest draft. */
export function createSceneDraftRecovery(storageKey: string | null, getStorage: StorageAccess = () => window.localStorage) {
  let input: RecoveryInput | null = null
  let inputSignature = ''
  let incomingBaseline: string | null = null
  let baseline = ''
  let expectedRaw: string | null = null
  let blocked = false
  let requiresResolution = false
  let initialized = false
  let clearedContext = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let view: RecoveryView = { candidate: null, status: { kind: 'idle', message: '' }, requiresResolution: false }
  const listeners = new Set<() => void>()

  function publish(status: SceneDraftStatus, record: SceneDraftRecord | null = null) {
    view = { status, candidate: record ? { ...record, baseChanged: record.baseFingerprint !== baseline } : null, requiresResolution }
    listeners.forEach(listener => listener())
  }

  function storageError(error?: unknown) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError'
    publish({ kind: 'error', message: quota
      ? 'Browser storage is full. This draft is still open, but cannot be backed up here. Export the JSON to keep a copy.'
      : 'Browser draft storage is unavailable. This draft is still open; export the JSON to keep a copy.' }, view.candidate)
  }

  function offer(raw: string | null, conflict: boolean) {
    expectedRaw = raw
    blocked = conflict || raw !== null
    requiresResolution = blocked
    const record = raw === null ? null : parseSceneDraftRecord(raw)
    publish({ kind: conflict ? 'conflict' : record ? 'available' : raw === null ? 'idle' : 'error',
      message: conflict
        ? 'Another tab changed this browser draft. Restore its draft or keep this editor’s version before browser backup resumes.'
        : record ? 'A browser draft is available. Restore it or discard it to continue browser backup.'
          : raw === null ? '' : 'This browser draft is damaged or unsupported. Discard it to resume browser backup.' }, record)
  }

  function readCurrent() {
    return storageKey === null ? null : getStorage().getItem(storageKey)
  }

  function checkUnchanged() {
    const raw = readCurrent()
    if (raw === expectedRaw) return true
    offer(raw, true)
    return false
  }

  function cancelTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function flush() {
    cancelTimer()
    if (!storageKey || !input || blocked || !initialized) return
    try {
      if (!checkUnchanged()) return
      const context = input.saveContext ?? emptyContext
      const fingerprint = sceneDraftFingerprint(input.snapshot)
      const contextDirty = JSON.stringify(context) !== clearedContext && (context.savedSceneId !== null || context.saveNeedsReview)
      if (fingerprint === baseline && !contextDirty) {
        if (expectedRaw !== null) getStorage().removeItem(storageKey)
        expectedRaw = null
        publish({ kind: 'idle', message: '' })
        return
      }
      const record: SceneDraftRecord = { version: 1, savedAt: Date.now(), baseFingerprint: baseline,
        snapshot: input.snapshot, saveContext: context }
      const raw = JSON.stringify(record)
      if (raw.length > SCENE_DRAFT_MAX_CHARACTERS) {
        publish({ kind: 'error', message: 'This draft is too large for browser backup. Export the JSON to keep a copy.' })
        return
      }
      getStorage().setItem(storageKey, raw)
      expectedRaw = raw
      publish({ kind: 'saved', message: 'Draft backed up in this browser.' })
    } catch (error) {
      storageError(error)
    }
  }

  function update(next: RecoveryInput) {
    const nextSignature = JSON.stringify(next)
    if (initialized && inputSignature === nextSignature) return
    const contextChanged = JSON.stringify(input?.saveContext) !== JSON.stringify(next.saveContext)
    input = next
    inputSignature = nextSignature
    if (incomingBaseline !== next.baseFingerprint) {
      incomingBaseline = next.baseFingerprint
      baseline = next.baseFingerprint
    }
    if (!initialized) {
      initialized = true
      if (storageKey) {
        try { offer(readCurrent(), false) } catch (error) { blocked = true; storageError(error) }
      }
    } else if (view.candidate && view.candidate.baseChanged !== (view.candidate.baseFingerprint !== baseline)) {
      publish(view.status, view.candidate)
    }
    cancelTimer()
    if (storageKey && !blocked) {
      if (contextChanged) flush()
      else timer = setTimeout(flush, SCENE_DRAFT_DEBOUNCE_MS)
    }
  }

  function onStorage(event: StorageEvent) {
    if (!storageKey || (event.key !== null && event.key !== storageKey)) return
    try {
      if (event.storageArea && event.storageArea !== getStorage()) return
      const raw = readCurrent()
      if (raw !== expectedRaw) { cancelTimer(); offer(raw, true) }
    } catch (error) { storageError(error) }
  }

  function restore(): SceneDraftRecord | null {
    try {
      if (!checkUnchanged() || !view.candidate) return null
      const record = view.candidate
      if (input) {
        input = { ...input, snapshot: record.snapshot, saveContext: record.saveContext }
        inputSignature = JSON.stringify(input)
      }
      blocked = false
      requiresResolution = false
      publish({ kind: 'saved', message: 'Browser draft restored. Review it before saving.' })
      return record
    } catch (error) { storageError(error); return null }
  }

  function discard() {
    if (!storageKey) return
    try {
      if (!checkUnchanged()) return
      getStorage().removeItem(storageKey)
      expectedRaw = null
      blocked = false
      requiresResolution = false
      publish({ kind: 'idle', message: '' })
      flush()
    } catch (error) { storageError(error) }
  }

  function clearAfterSave(savedSnapshot: SceneDraftSnapshot) {
    if (!input) return
    baseline = sceneDraftFingerprint(savedSnapshot)
    clearedContext = JSON.stringify(input.saveContext ?? emptyContext)
    // flush compares the submitted snapshot against the latest editor state and storage record.
    // Edits made during the request stay recoverable; another tab's copy is never removed here.
    flush()
  }

  function persistSaveContext(saveContext: SceneDraftSaveContext) {
    if (!input) return
    update({ ...input, saveContext })
    flush()
  }

  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => view,
    update, flush, onStorage, restore, discard, keepCurrent: discard, clearAfterSave, persistSaveContext,
    dispose: () => { flush(); cancelTimer() },
  }
}
