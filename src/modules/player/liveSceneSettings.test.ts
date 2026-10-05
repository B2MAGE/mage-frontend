import { describe, expect, it, vi } from 'vitest'
import { diffLiveSceneSettings, extractLiveSceneSettings, validateLiveSceneSettings } from './liveSceneSettings'
import { scenePlaybackIdentity } from './scenePlaybackIdentity'

const raw = { visualizer: { shader: 'sphere(.5)', skyboxPreset: 6 } }
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

describe('bounded live scene settings', () => {
  it('normalizes optional settings, including removing a previously authored value', () => {
    const start = extractLiveSceneSettings(raw)
    const changed = extractLiveSceneSettings({ ...raw, intent: { fov: 100 }, fx: { passes: { rgbShift: true } } })
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
    expect(raw).toEqual({ visualizer: { shader: 'sphere(.5)', skyboxPreset: 6 } })
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

  it('canonicalizes legacy and versioned custom identities without hiding invalid live data', () => {
    expect(scenePlaybackIdentity(raw)).toBe(scenePlaybackIdentity({ schemaVersion: 1, kind: 'custom', scene: raw }))
    expect(scenePlaybackIdentity({ ...raw, intent: { fov: 80 } })).toBe(scenePlaybackIdentity(raw))
    expect(scenePlaybackIdentity({ ...raw, controls: { position0: { x: 0, y: 0, z: 0 } } })).toBeNull()
    expect(scenePlaybackIdentity({ ...raw, fx: { unknown: true } })).toBeNull()
  })
})
