import { describe, expect, it, vi } from 'vitest'
import { assertBuilderBindingManifest, validateBuilderLiveBindings } from './builderBindings'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { createBuilderBinding } from './builderDefinitions'
import { parseSceneDocument, type BuilderSceneDocument } from './sceneContract'
import { extractLiveSceneSettings, validateLiveSceneSettings } from '../liveSceneSettings'
import { scenePlaybackIdentity } from '../scenePlaybackIdentity'

const pair = () => parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1, objects: [
  { id: 'bass', operation: { type: 'sphere' }, bindings: [{ target: 'scale.x', source: 'bass-level' }] },
  { id: 'highs', operation: { type: 'box' }, bindings: [{ target: 'scale.x', source: 'treble-hit' }, { target: 'rotation.y', source: 'pointer-x' }] },
] }) as BuilderSceneDocument

describe('independent Builder binding transport', () => {
  it('carries independent, bounded metadata without turning live edits into compilation work', () => {
    const document = pair()
    const before = compileBuilderPreviewDocument(document)
    const identity = scenePlaybackIdentity(document)
    document.objects[0].bindings[0] = { ...document.objects[0].bindings[0], source: 'mid-hit', amount: -2, offset: 1, attack: 0.2 }
    document.objects[1].bindings.reverse()
    const compiled = compileBuilderPreviewDocument(document)
    expect(compiled.shader).toBe(before.shader)
    expect(scenePlaybackIdentity(document)).toBe(identity)
    const snapshot = extractLiveSceneSettings(document)
    expect(snapshot.builderBindings).toEqual(compiled.bindings)
    expect(snapshot.builderBindings).toContainEqual({ objectIndex: 0, ...document.objects[0].bindings[0] })
    expect(validateLiveSceneSettings(snapshot)).toEqual(snapshot)
    expect(() => assertBuilderBindingManifest(compiled.bindings, compiled.uniforms)).not.toThrow()
    expect(compiled.shader).not.toContain('mid-hit')
  })

  it('adds and removes a response through live settings when the preview already has its property slot', () => {
    const document = pair()
    const before = scenePlaybackIdentity(document)
    document.objects[0].bindings.push(createBuilderBinding('position.y', 'pointer-y'))
    expect(scenePlaybackIdentity(document)).toBe(before)
    expect(extractLiveSceneSettings(document).builderBindings).toHaveLength(4)
    document.objects[0].bindings = []
    expect(scenePlaybackIdentity(document)).toBe(before)
    expect(extractLiveSceneSettings(document).builderBindings).toHaveLength(2)
  })

  it.each([
    { source: 'eval' }, { target: 'shader' }, { amount: 4.01 }, { offset: -4.01 },
    { attack: -0.01 }, { release: 5.01 }, { amount: Infinity }, { mode: 'multiply' }, { name: 'other_uniform' },
  ])('rejects invalid metadata independently in compiler and live transport: %j', changes => {
    const document = pair()
    Object.assign(document.objects[0].bindings[0], changes)
    expect(() => compileBuilderDocument(document)).toThrow(/binding/i)
    expect(() => validateBuilderLiveBindings([{ objectIndex: 0, ...document.objects[0].bindings[0] }])).toThrow(/binding/i)
  })

  it('rejects duplicate, missing, group and foreign addresses without reading accessors', () => {
    const document = pair(), binding = { objectIndex: 0, ...document.objects[0].bindings[0] }
    const compiled = compileBuilderPreviewDocument(document)
    expect(() => validateBuilderLiveBindings([binding, binding])).toThrow()
    expect(() => validateBuilderLiveBindings([{ ...binding, objectIndex: 16 }])).toThrow()
    expect(() => validateBuilderLiveBindings([{ ...binding, groupIndex: 0 }])).toThrow()
    expect(() => validateBuilderLiveBindings(new Array(1))).toThrow()
    expect(() => assertBuilderBindingManifest([{ ...binding, objectIndex: 3 }], compiled.uniforms)).toThrow()
    const getter = vi.fn(() => 'bass-level')
    const accessor = Object.defineProperty({ ...binding }, 'source', { get: getter })
    expect(() => validateBuilderLiveBindings([accessor])).toThrow()
    expect(getter).not.toHaveBeenCalled()
    const snapshot = extractLiveSceneSettings(document)
    expect(() => validateLiveSceneSettings({ ...snapshot, builderBindings: [{ ...binding, objectIndex: 3 }] })).toThrow()
    expect(() => validateLiveSceneSettings({ ...snapshot, builderUniforms: undefined })).toThrow()
  })
})
