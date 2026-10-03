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
})
