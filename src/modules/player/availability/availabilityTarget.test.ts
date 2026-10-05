import { describe, expect, it, vi } from 'vitest'
import { availabilityStatusTarget, availabilityTarget } from './availabilityTarget'
import { resolveSceneForPlayback } from '../templates/resolveScene'

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

describe('validated scene availability targets', () => {
  it('keeps builder drafts unavailable and saved builders on status checks without custom permission', () => {
    const builder = { schemaVersion: 1, kind: 'builder', builderVersion: 1, objects: [] }
    expect(availabilityTarget(undefined, builder)).toBe('draft-builder')
    expect(availabilityTarget(47, builder)).toBe('status:47')
    expect(() => resolveSceneForPlayback(builder)).toThrow('Builder scene playback is not available yet')
  })

  it('recognizes only a complete valid template contract and a host-supplied saved ID', () => {
    expect(availabilityTarget(undefined, template)).toBe('draft-template')
    expect(availabilityTarget('47', template)).toBe('template:47')
    expect(availabilityTarget(47, template)).toBe('template:47')
    expect(availabilityTarget('template:47', template)).toBe('draft-template')
    expect(availabilityTarget(-1, template)).toBe('draft-template')
  })

  it.each([
    undefined,
    { ...template, templateId: 'unknown' },
    { ...template, templateVersion: 2 },
    { ...template, visualizer: { shader: 'sphere(1);' } },
    { ...template, source: 'sphere(1);' },
    { ...template, sceneId: 47 },
    { ...template, settings: { camera: { fov: 900 } } },
    { kind: 'template', visualizer: { shader: 'sphere(1);' } },
  ])('does not grant template permission for malformed data (%j)', blob => {
    expect(availabilityTarget(undefined, blob)).toBe('custom')
    expect(availabilityTarget(47, blob)).toBe(47)
  })

  it('does not promote a source match or a custom envelope into a trusted template', () => {
    const raw = resolveSceneForPlayback(template).engineScene
    expect(availabilityTarget(undefined, raw)).toBe('custom')
    expect(availabilityTarget(47, { schemaVersion: 1, kind: 'custom', scene: raw })).toBe(47)
  })

  it('rejects accessor spoofing without executing the getter', () => {
    const getter = vi.fn(() => 'template')
    const forged = Object.defineProperty({ ...template }, 'kind', { get: getter, enumerable: true })
    expect(availabilityTarget(47, forged)).toBe(47)
    expect(getter).not.toHaveBeenCalled()
  })

  it('separates missing-source status checks from rendering authorization', () => {
    expect(availabilityStatusTarget(47)).toBe('status:47')
    expect(availabilityTarget(47)).toBe(47)
    expect(availabilityStatusTarget('status:47')).toBe('custom')
    expect(availabilityStatusTarget(Number.MAX_SAFE_INTEGER + 1)).toBe('custom')
  })
})
