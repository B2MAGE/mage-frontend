import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { createTemplateScene } from './templateEditor'
import { parseSceneDocument, type BuilderSceneDocument } from '@modules/player'
import { createSceneDraftRecovery, parseSceneDraftRecord, SCENE_DRAFT_MAX_CHARACTERS,
  sceneDraftFingerprint, sceneDraftStorageKey, type SceneDraftRecord, type SceneDraftSnapshot } from './sceneDraftRecovery'

function snapshot(name = 'Draft'): SceneDraftSnapshot {
  const sceneData = createBuilderScene()
  return { name, description: '', sceneData, sceneDataText: JSON.stringify(sceneData),
    selectedTagIds: [1], selectedBuilderObjectId: 'object-1' }
}
function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }) }
}
function record(draft: SceneDraftSnapshot, base: SceneDraftSnapshot = snapshot()): SceneDraftRecord {
  return { version: 1, savedAt: 123, baseFingerprint: sceneDraftFingerprint(base), snapshot: draft,
    saveContext: { savedSceneId: null, expectedRevision: null, saveNeedsReview: false } }
}

describe('current browser draft format', () => {
  it('separates accounts, create, and every edit destination', () => {
    const keys = [sceneDraftStorageKey('first', null), sceneDraftStorageKey('second', null),
      sceneDraftStorageKey('first', 1), sceneDraftStorageKey('first', 2),
      sceneDraftStorageKey('first:edit:1', null)]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps invalid raw JSON and authored validation errors without normalizing them', () => {
    const draft = snapshot()
    draft.sceneDataText = '{ unfinished raw JSON'
    draft.sceneData = { ...draft.sceneData, parameters: { scale: -20, speed: 1 } }
    expect(parseSceneDraftRecord(JSON.stringify(record(draft)))?.snapshot).toEqual(draft)
  })

  it('ignores selection when determining whether the scene changed', () => {
    expect(sceneDraftFingerprint(snapshot())).toBe(sceneDraftFingerprint({ ...snapshot(), selectedBuilderObjectId: null }))
  })

  it('recovers normalized Template and internal Custom editor documents', () => {
    for (const sceneData of [createTemplateScene(), { visualizer: { shader: 'sphere(1)' } }]) {
      const draft = { ...snapshot(), sceneData, sceneDataText: '{ invalid JSON' }
      expect(parseSceneDraftRecord(JSON.stringify(record(draft)))?.snapshot).toEqual(draft)
    }
  })

  it('rejects corruption, old versions, invalid metadata, and excessive records', () => {
    const valid = record(snapshot())
    for (const value of ['{', JSON.stringify({ ...valid, version: 0 }),
      JSON.stringify({ ...valid, snapshot: { ...valid.snapshot, selectedTagIds: ['1'] } }),
      JSON.stringify({ ...valid, snapshot: { ...valid.snapshot, sceneData: { schemaVersion: 2, kind: 'builder' } } }),
      JSON.stringify({ ...valid, snapshot: { ...valid.snapshot, sceneData: { schemaVersion: 1, kind: 'builder' } } }),
      JSON.stringify({ ...valid, snapshot: { ...valid.snapshot, sceneData: {} } }),
      JSON.stringify({ ...valid, saveContext: { savedSceneId: -1, saveNeedsReview: false } }),
      ' '.repeat(SCENE_DRAFT_MAX_CHARACTERS + 1)]) {
      expect(parseSceneDraftRecord(value)).toBeNull()
    }
  })

  it('rejects damaged Builder structure without exposing it as a restore candidate', () => {
    const valid = record(snapshot())
    const scene = createBuilderScene()
    const malformedObjects = [null, { ...scene.objects[0], arrangements: null },
      { ...scene.objects[0], operation: { type: 'unknown', radius: 1 } },
      { ...scene.objects[0], transform: { scale: 'broken' } }]
    for (const object of malformedObjects) {
      const damaged = { ...valid, snapshot: { ...valid.snapshot, sceneData: { ...scene, objects: [object] } } }
      expect(parseSceneDraftRecord(JSON.stringify(damaged))).toBeNull()
    }
  })

  it('restores selected groups and repairable scalar edits but never cyclic or dangling trees', () => {
    const scene = parseSceneDocument({ ...createBuilderScene(), composition: { version: 1,
      roots: ['group-1'], groups: [{ id: 'group-1', children: ['object-1'], operation: { type: 'union' } }],
    } }) as BuilderSceneDocument
    scene.composition!.groups[0].transform.scale = -1
    const draft = { ...snapshot(), sceneData: scene, selectedBuilderObjectId: 'group-1' }
    expect(parseSceneDraftRecord(JSON.stringify(record(draft)))?.snapshot).toEqual(draft)
    for (const children of [['missing'], ['group-1'], ['object-1', 'object-1']]) {
      const broken = structuredClone(draft)
      broken.sceneData.composition!.groups[0].children = children
      expect(parseSceneDraftRecord(JSON.stringify(record(broken)))).toBeNull()
    }
  })
})

describe('browser draft recovery controller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces edits, keeps the latest draft, and offers it after reload', () => {
    const storage = memoryStorage()
    const base = snapshot()
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: base, baseFingerprint: sceneDraftFingerprint(base) })
    recovery.update({ snapshot: snapshot('First edit'), baseFingerprint: sceneDraftFingerprint(base) })
    recovery.update({ snapshot: snapshot('Latest edit'), baseFingerprint: sceneDraftFingerprint(base) })
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const reloaded = createSceneDraftRecovery('test', () => storage)
    reloaded.update({ snapshot: base, baseFingerprint: sceneDraftFingerprint(base) })
    expect(reloaded.getSnapshot().candidate?.snapshot.name).toBe('Latest edit')
    expect(reloaded.getSnapshot().requiresResolution).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(reloaded.restore()?.snapshot.name).toBe('Latest edit')
    expect(reloaded.getSnapshot().requiresResolution).toBe(false)
    recovery.dispose()
    reloaded.dispose()
  })

  it('reports that the loaded server baseline changed and requires explicit restore or discard', () => {
    const storage = memoryStorage()
    storage.setItem('test', JSON.stringify(record(snapshot('Recovered'))))
    const recovery = createSceneDraftRecovery('test', () => storage)
    const base = snapshot('New server name')
    recovery.update({ snapshot: base, baseFingerprint: sceneDraftFingerprint(base) })
    expect(recovery.getSnapshot().candidate?.baseChanged).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.snapshot.name).toBe('Recovered')
    recovery.discard()
    expect(storage.getItem('test')).toBeNull()
    recovery.dispose()
  })

  it('does not replace a restored draft with the old render while state restoration is pending', () => {
    const storage = memoryStorage()
    storage.setItem('test', JSON.stringify(record(snapshot('Recovered'))))
    const recovery = createSceneDraftRecovery('test', () => storage)
    const base = snapshot()
    recovery.update({ snapshot: base, baseFingerprint: sceneDraftFingerprint(base) })
    const restored = recovery.restore()!
    recovery.flush()
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.snapshot.name).toBe('Recovered')
    recovery.update({ snapshot: restored.snapshot, baseFingerprint: sceneDraftFingerprint(base) })
    recovery.dispose()
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.snapshot.name).toBe('Recovered')
  })

  it('clears a successfully saved revision but retains edits made while saving', () => {
    const storage = memoryStorage()
    const base = snapshot()
    const saved = snapshot('Sent to server')
    const latest = snapshot('Edited while saving')
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: saved, baseFingerprint: sceneDraftFingerprint(base) })
    recovery.flush()
    recovery.update({ snapshot: latest, baseFingerprint: sceneDraftFingerprint(base) })
    recovery.clearAfterSave(saved)
    const kept = parseSceneDraftRecord(storage.getItem('test')!)!
    expect(kept.snapshot.name).toBe('Edited while saving')
    expect(kept.baseFingerprint).toBe(sceneDraftFingerprint(saved))
    recovery.clearAfterSave(latest)
    expect(storage.getItem('test')).toBeNull()
    recovery.dispose()
    expect(storage.getItem('test')).toBeNull()
  })

  it('detects missed cross-tab events before writes and does not delete another tab’s record after save', () => {
    const storage = memoryStorage()
    const base = snapshot()
    const local = snapshot('This tab')
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: local, baseFingerprint: sceneDraftFingerprint(base) })
    recovery.flush()
    const external = JSON.stringify(record(snapshot('Other tab')))
    storage.setItem('test', external)
    recovery.clearAfterSave(local)
    expect(storage.getItem('test')).toBe(external)
    expect(recovery.getSnapshot().status.kind).toBe('conflict')
    expect(recovery.getSnapshot().requiresResolution).toBe(true)
    expect(recovery.getSnapshot().candidate?.snapshot.name).toBe('Other tab')
    recovery.dispose()
    expect(storage.getItem('test')).toBe(external)
  })

  it('pauses on external changes, including deletion, until the user keeps this editor’s version', () => {
    const storage = memoryStorage()
    const base = snapshot()
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: snapshot('This tab'), baseFingerprint: sceneDraftFingerprint(base) })
    recovery.flush()
    storage.removeItem('test')
    recovery.onStorage(new StorageEvent('storage', { key: 'test' }))
    recovery.flush()
    expect(storage.getItem('test')).toBeNull()
    expect(recovery.getSnapshot().status.kind).toBe('conflict')
    recovery.keepCurrent()
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.snapshot.name).toBe('This tab')
    recovery.dispose()
  })

  it('rechecks the candidate before an explicit restore if another tab changed it again', () => {
    const storage = memoryStorage()
    storage.setItem('test', JSON.stringify(record(snapshot('Earlier'))))
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: snapshot(), baseFingerprint: sceneDraftFingerprint(snapshot()) })
    storage.setItem('test', JSON.stringify(record(snapshot('Newer'))))
    expect(recovery.restore()).toBeNull()
    expect(recovery.getSnapshot().candidate?.snapshot.name).toBe('Newer')
    expect(recovery.restore()?.snapshot.name).toBe('Newer')
    recovery.dispose()
  })

  it('persists pending and resolved create identity even for a clean editor snapshot', () => {
    const storage = memoryStorage()
    const base = snapshot()
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: base, baseFingerprint: sceneDraftFingerprint(base),
      saveContext: { savedSceneId: null, expectedRevision: null, saveNeedsReview: true } })
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.saveContext.saveNeedsReview).toBe(true)
    recovery.persistSaveContext({ savedSceneId: 45, expectedRevision: 0, saveNeedsReview: false })
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.saveContext.savedSceneId).toBe(45)
    recovery.clearAfterSave(base)
    expect(storage.getItem('test')).toBeNull()
    recovery.dispose()
  })

  it('does not replace corrupt records until explicitly discarded', () => {
    const storage = memoryStorage()
    storage.setItem('test', '{broken')
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: snapshot('Changed'), baseFingerprint: sceneDraftFingerprint(snapshot()) })
    recovery.flush()
    expect(storage.getItem('test')).toBe('{broken')
    expect(recovery.getSnapshot().status.kind).toBe('error')
    expect(recovery.getSnapshot().requiresResolution).toBe(true)
    recovery.discard()
    expect(recovery.getSnapshot().requiresResolution).toBe(false)
    expect(parseSceneDraftRecord(storage.getItem('test')!)?.snapshot.name).toBe('Changed')
    recovery.dispose()
  })

  it('reports unavailable storage, quota, and size limits without throwing away editor state', () => {
    const unavailable = createSceneDraftRecovery('test', () => { throw new Error('Disabled') })
    expect(() => unavailable.update({ snapshot: snapshot(), baseFingerprint: '' })).not.toThrow()
    expect(unavailable.getSnapshot().status.message).toContain('unavailable')
    expect(unavailable.getSnapshot().requiresResolution).toBe(false)
    const storage = memoryStorage()
    storage.setItem.mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    const recovery = createSceneDraftRecovery('test', () => storage)
    recovery.update({ snapshot: snapshot(), baseFingerprint: '' })
    expect(() => recovery.flush()).not.toThrow()
    expect(recovery.getSnapshot().status.message).toContain('full')
    expect(recovery.getSnapshot().requiresResolution).toBe(false)
    recovery.update({ snapshot: { ...snapshot(), sceneDataText: 'x'.repeat(SCENE_DRAFT_MAX_CHARACTERS) }, baseFingerprint: '' })
    recovery.flush()
    expect(recovery.getSnapshot().status.message).toContain('too large')
    unavailable.dispose()
    recovery.dispose()
  })

  it('never touches storage when the signed-in storage key is absent', () => {
    const getStorage = vi.fn(() => memoryStorage())
    const recovery = createSceneDraftRecovery(null, getStorage)
    recovery.update({ snapshot: snapshot(), baseFingerprint: '' })
    recovery.dispose()
    expect(getStorage).not.toHaveBeenCalled()
  })
})
