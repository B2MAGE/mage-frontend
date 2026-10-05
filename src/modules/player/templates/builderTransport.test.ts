import { describe, expect, it, vi } from 'vitest'
import { parseSceneImport, SceneValidationError, validateSceneForPlayback, validateSceneForStorage } from '../policy/sceneValidation'
import { resolveSceneForPlayback } from './resolveScene'
import { buildScenePlaylistTrack } from '../playlist'
import { sceneForBridge } from '../isolation/playbackProtocol'

const builder = { schemaVersion: 1, kind: 'builder', builderVersion: 1,
  objects: [{ id: 'ball', operation: { type: 'sphere' }, bindings: [{ target: 'scale.x', source: 'bass-hit' }] }] }

describe('builder storage and playback boundaries', () => {
  it.each([
    [{ ...builder, objects: [{ id: 'ball', operation: { type: 'sphere', radius: 0 } }] }, 'sceneData.objects[0].operation.radius'],
    [{ ...builder, objects: [builder.objects[0], builder.objects[0]] }, 'sceneData.objects[1]'],
    [{ ...builder, objects: [{ ...builder.objects[0], bindings: [builder.objects[0].bindings[0], builder.objects[0].bindings[0]] }] }, 'sceneData.objects[0].bindings[1]'],
  ])('reports the invalid operation field or duplicate item at the backend-compatible path', (document, path) => {
    try {
      validateSceneForStorage(document)
      expect.fail('Expected invalid builder data to be rejected')
    } catch (error) {
      expect(error).toBeInstanceOf(SceneValidationError)
      expect(Object.keys((error as SceneValidationError).details)).toEqual([path])
    }
  })

  it('normalizes bounded builder data for import and storage without modifying its original objects', () => {
    const before = JSON.stringify(builder)
    const stored = validateSceneForStorage(builder)
    expect(stored).toMatchObject({ kind: 'builder', builderVersion: 1, objects: [{
      id: 'ball', name: 'Object', operation: { type: 'sphere', radius: 1 },
      transform: { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      bindings: [{ target: 'scale.x', source: 'bass-hit', mode: 'add', amount: 1, offset: 0, attack: 0.04, release: 0.35 }],
    }] })
    expect(parseSceneImport(before)).toEqual(stored)
    expect(validateSceneForStorage(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
    expect(JSON.stringify(builder)).toBe(before)
  })

  it('rejects builders at every rendering handoff and never discovers embedded audio', () => {
    for (const resolve of [validateSceneForPlayback, resolveSceneForPlayback, sceneForBridge]) {
      expect(() => resolve(builder)).toThrow('Builder scene playback is not available yet')
    }
    expect(buildScenePlaylistTrack(builder)).toBeNull()
    expect(buildScenePlaylistTrack({ ...builder, audioPath: 'https://example.com/untrusted.mp3' })).toBeNull()
  })

  it('applies transport limits before normalization and rejects accessors without calling them', () => {
    const getter = vi.fn(() => [])
    expect(() => validateSceneForStorage(Object.defineProperty({ ...builder }, 'objects', { get: getter, enumerable: true }))).toThrow()
    expect(getter).not.toHaveBeenCalled()
    expect(() => parseSceneImport('{"schemaVersion":1,"kind":"builder","builderVersion":1,"objects":[],"objects":[]}')).toThrow()
    expect(() => validateSceneForStorage({ ...builder, objects: [{ id: 'ball', operation: { type: 'sphere' }, name: 'x'.repeat(300_000) }] })).toThrow('bytes')
  })

  it('counts materialized defaults in the budget and accepts the full sixteen-object minimum', () => {
    expect(validateSceneForStorage({ ...builder, objects: Array.from({ length: 16 }, (_, id) => ({ id: `ball-${id}`, operation: { type: 'sphere' } })) }))
      .toHaveProperty('objects.length', 16)
    const full = { ...builder, objects: Array.from({ length: 16 }, (_, id) => ({ id: `ball-${id}`, operation: { type: 'sphere' },
      bindings: ['position.x', 'position.y', 'position.z', 'scale.x'].map(target => ({ target, source: 'bass-hit' })),
    })) }
    expect(() => validateSceneForStorage(full)).toThrow('Too many total object fields')
  })
})
