import { describe, expect, it, vi } from 'vitest'
import { scenePlaybackIdentity } from './scenePlaybackIdentity'

describe('versioned scene playback identity', () => {
  const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

  it('routes forbidden music fields through validation instead of identifying them as a live update', () => {
    expect(scenePlaybackIdentity(template)).not.toBeNull()
    expect(scenePlaybackIdentity({ ...template, audioResponse: 'legacy' })).toBeNull()
    expect(scenePlaybackIdentity({ ...template, audioResponseConfig: { source: 'injected' } })).toBeNull()
  })

  it('does not invoke accessors while identifying a versioned scene', () => {
    const getter = vi.fn(() => { throw new Error('must not execute') })
    const value = Object.defineProperty({ ...template }, 'parameters', { enumerable: true, get: getter })
    expect(scenePlaybackIdentity(value)).toBeNull()
    expect(getter).not.toHaveBeenCalled()
  })

  it('omits validated live settings while retaining template/resource and initial state changes', () => {
    const document = { ...template, settings: { audioResponse: 'mapped-v1', audioResponseConfig: {
      version: 1, sensitivity: 0.4, mappings: [{ target: 'size', source: 'bass-hit', amount: 0.2 }],
    } } }
    const before = structuredClone(document)
    expect(scenePlaybackIdentity(document, 24)).toBe(scenePlaybackIdentity(template, 24))
    expect(document).toEqual(before)
    expect(scenePlaybackIdentity(document, 25)).not.toBe(scenePlaybackIdentity(document, 24))
    for (const changed of [
      { ...document, parameters: { scale: 11 } },
      { ...document, settings: { ...document.settings, camera: { fov: 90 } } },
      { ...document, settings: { ...document.settings, motion: { minimizing_factor: 0.3 } } },
      { ...document, settings: { ...document.settings, effects: { passes: { rgbShift: true } } } },
    ]) expect(scenePlaybackIdentity(changed, 24)).toBe(scenePlaybackIdentity(document, 24))
    for (const changed of [
      { ...document, templateId: 'embedded-scene-1' },
      { ...document, settings: { ...document.settings, skybox: 2 } },
      { ...document, settings: { ...document.settings, state: { time: 12 } } },
    ]) expect(scenePlaybackIdentity(changed, 24)).not.toBe(scenePlaybackIdentity(document, 24))
  })

  it.each([
    { version: 1, shader: 'untrusted()' },
    { version: 1, sensitivity: 5 },
    { version: 1, mappings: [{ target: 'size', source: 'bass-hit', code: 'untrusted()' }] },
    { version: 1, mappings: [{ target: 'size', source: 'bass-hit' }, { target: 'size', source: 'mid-hit' }] },
  ])('validates nested template response fields before excluding them from identity', audioResponseConfig => {
    expect(scenePlaybackIdentity({ ...template, settings: { audioResponseConfig } })).toBeNull()
  })
})
