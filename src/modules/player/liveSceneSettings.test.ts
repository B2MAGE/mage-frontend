import { customDocument } from '@shared/test/sceneDocument'
import { describe, expect, it, vi } from 'vitest'
import { diffLiveSceneSettings, extractLiveSceneSettings, validateLiveSceneSettings } from './liveSceneSettings'
import { scenePlaybackIdentity } from './scenePlaybackIdentity'
import { parseSceneDocument, type BuilderSceneDocument } from './templates/sceneContract'

const raw = customDocument({ visualizer: { shader: 'sphere(.5)', skyboxPreset: 6 } })
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

describe('bounded live scene settings', () => {
  const builder = () => parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'shape', operation: { type: 'sphere' } }] }) as BuilderSceneDocument

  it('keeps supported Builder edits live and geometry changes structural', () => {
    const initial = builder(), next = structuredClone(initial)
    next.objects[0].transform.position.x = 4
    next.objects[0].material.metalness = 0.7
    expect(scenePlaybackIdentity(next)).toBe(scenePlaybackIdentity(initial))
    const settings = extractLiveSceneSettings(next)
    expect(settings.builderUniforms).toContainEqual({ objectIndex: 0, target: 'position.x', value: 4 })
    expect(settings.builderUniforms).toContainEqual({ objectIndex: 0, target: 'material.metalness', value: 0.7 })
    expect(diffLiveSceneSettings(extractLiveSceneSettings(initial), settings)).toEqual({})
    next.objects[0].operation = { type: 'sphere', radius: 2 }
    expect(scenePlaybackIdentity(next)).not.toBe(scenePlaybackIdentity(initial))
  })

  it('keeps group transforms and blend live while ordered membership stays structural', () => {
    const initial = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'left', operation: { type: 'sphere' } }, { id: 'right', operation: { type: 'box' } }],
      composition: { version: 1, roots: ['pair'], groups: [{ id: 'pair', children: ['left', 'right'],
        operation: { type: 'smooth-union', blend: 0.3 } }] } }) as BuilderSceneDocument
    const next = structuredClone(initial), group = next.composition!.groups[0]
    group.transform.position.x = 2
    group.transform.rotation.z = 0.6
    group.transform.scale = 1.5
    group.operation = { type: 'smooth-union', blend: 0 }
    expect(scenePlaybackIdentity(next)).toBe(scenePlaybackIdentity(initial))
    const settings = extractLiveSceneSettings(next)
    expect(settings.builderUniforms).toEqual(expect.arrayContaining([
      { groupIndex: 0, target: 'position.x', value: 2 },
      { groupIndex: 0, target: 'rotation.z', value: 0.6 },
      { groupIndex: 0, target: 'scale', value: 1.5 },
      { groupIndex: 0, target: 'blend', value: 0 },
    ]))
    expect(validateLiveSceneSettings(settings)).toEqual(settings)
    group.children.reverse()
    expect(scenePlaybackIdentity(next)).not.toBe(scenePlaybackIdentity(initial))
  })

  it.each([
    [{ objectIndex: 0, target: 'position.x', value: 101 }],
    [{ objectIndex: 16, target: 'position.x', value: 0 }],
    [{ objectIndex: 0, target: 'shader.source', value: 0 }],
    [{ objectIndex: 0, target: 'position.x', value: NaN }],
    [{ objectIndex: 0, target: 'position.x', value: 1, name: 'other' }],
    Array.from({ length: 65 }, () => ({ objectIndex: 0, target: 'position.x', value: 0 })),
    [{ objectIndex: 0, target: 'position.x', value: 0 }, { objectIndex: 0, target: 'position.x', value: 1 }],
    [{ groupIndex: 8, target: 'position.x', value: 0 }],
    [{ groupIndex: 0, target: 'scale', value: 0 }],
    [{ groupIndex: 0, target: 'blend', value: 2.1 }],
    [{ groupIndex: 0, objectIndex: 0, target: 'position.x', value: 1 }],
    [{ groupIndex: 0, target: 'children', value: 0 }],
    [{ groupIndex: 0, target: 'scale', value: 1 }, { groupIndex: 0, target: 'scale', value: 2 }],
  ])('rejects malformed Builder snapshots atomically', (...builderUniforms) => {
    expect(() => validateLiveSceneSettings({ ...extractLiveSceneSettings(builder()), builderUniforms })).toThrow()
  })
  it('normalizes optional settings, including removing a previously authored value', () => {
    const start = extractLiveSceneSettings(raw)
    const changed = extractLiveSceneSettings(customDocument({ ...raw.scene, intent: { fov: 100 }, fx: { passes: { rgbShift: true } } }))
    expect(diffLiveSceneSettings(start, changed)).toEqual({ intent: { fov: 100 }, fx: { passes: { rgbShift: true } } })
    expect(diffLiveSceneSettings(changed, start)).toEqual({ intent: { fov: 75 }, fx: { passes: { rgbShift: false } } })
    expect(diffLiveSceneSettings(start, extractLiveSceneSettings(raw))).toEqual({})
    expect(start.fx.bloom.enabled).toBe(false)
    expect(start.fx.passes.outputPass).toBe(true)
  })

  it('preserves template-specific defaults and only changes requested camera components', () => {
    const before = extractLiveSceneSettings(template)
    const after = extractLiveSceneSettings({ ...template, settings: { controls: {
      ...before.controls, position0: { ...before.controls.position0, x: 3 },
    } } })
    expect(diffLiveSceneSettings(before, after)).toEqual({ controls: { position0: { x: 3 } } })
    expect(before.intent.autoRotateSpeed).toBe(0.2)
  })

  it('returns independent snapshots without changing saved source or caller data', () => {
    const settings = extractLiveSceneSettings(raw)
    const copy = validateLiveSceneSettings(settings)
    copy.controls.position0.x = 100
    copy.fx.passOrder.reverse()
    expect(settings.controls.position0.x).toBe(0)
    expect(extractLiveSceneSettings(raw)).toEqual(settings)
    expect(raw.scene).toEqual({ visualizer: { shader: 'sphere(.5)', skyboxPreset: 6 } })
    expect(JSON.stringify(settings)).not.toContain('shader')
  })

  it.each([
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, visualizer: { ...v.visualizer, shader: 'evil()' } }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, audio: 'https://example.com/music.mp3' }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, intent: { ...v.intent, fov: Infinity } }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, intent: { ...v.intent, fov: 180 } }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, fx: { ...v.fx, passes: { ...v.fx.passes,
      rgbShift: true, dot: true, glitch: true, colorify: true, toon: true } } }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, fx: { ...v.fx, passOrder: ['bloom', 'bloom'] } }),
    (v: ReturnType<typeof extractLiveSceneSettings>) => ({ ...v, state: { time: 1, volume_multiplier: 0 } }),
  ])('rejects unsafe or malformed snapshots before diffing or application', change => {
    expect(() => validateLiveSceneSettings(change(extractLiveSceneSettings(raw)))).toThrow()
  })

  it('rejects accessors, prototypes and oversized input without executing hooks', () => {
    const getter = vi.fn(() => { throw new Error('do not execute') })
    const data = Object.defineProperty(extractLiveSceneSettings(raw), 'intent', { enumerable: true, get: getter })
    expect(() => validateLiveSceneSettings(data)).toThrow()
    expect(getter).not.toHaveBeenCalled()
    expect(() => validateLiveSceneSettings(Object.create(extractLiveSceneSettings(raw)))).toThrow()
    expect(() => validateLiveSceneSettings({ data: 'x'.repeat(600_000) })).toThrow()
  })

  it('canonicalizes current custom identities without hiding invalid live data', () => {
    expect(scenePlaybackIdentity(raw)).toBe(scenePlaybackIdentity({ schemaVersion: 1, kind: 'custom', scene: raw.scene }))
    expect(scenePlaybackIdentity(customDocument({ ...raw.scene, intent: { fov: 80 } }))).toBe(scenePlaybackIdentity(raw))
    expect(scenePlaybackIdentity(customDocument({ ...raw.scene, controls: { position0: { x: 0, y: 0, z: 0 } } }))).toBeNull()
    expect(scenePlaybackIdentity(customDocument({ ...raw.scene, fx: { unknown: true } }))).toBeNull()
  })
})
