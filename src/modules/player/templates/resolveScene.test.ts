import { describe, expect, it } from 'vitest'
import { listSceneTemplates, getTemplateDefinition } from './templateRegistry'
import { resolveSceneForPlayback } from './resolveScene'

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }

describe('resolveSceneForPlayback', () => {
  it.each(listSceneTemplates())('resolves $label to its exact owned source', (entry) => {
    const result = resolveSceneForPlayback({ ...template, templateId: entry.templateId })
    expect(result.kind).toBe('template')
    expect(result.trust).toBe('platform-owned')
    expect(result.engineScene.visualizer).toEqual({
      shader: getTemplateDefinition(entry.templateId, 1)?.shader, scale: 10, skyboxPreset: 6,
    })
    expect(result.engineScene).not.toHaveProperty('templateId')
  })

  it('maps every allowed value to engine data without changing source', () => {
    const result = resolveSceneForPlayback({ ...template,
      parameters: { scale: 12, speed: 0.4 },
      settings: { skybox: 3, camera: { fov: 60, autoRotate: false, orbitSpeed: 0.6 },
        bloom: { enabled: true, strength: 1.6, radius: 0.3, threshold: 0.2 },
        tint: { enabled: true, color: '#aabbcc' } },
    }).engineScene
    expect(result.visualizer).toEqual({ shader: getTemplateDefinition(template.templateId, 1)?.shader, scale: 12, skyboxPreset: 3 })
    expect(result.intent).toMatchObject({ time_multiplier: 0.4, fov: 60, autoRotate: false, autoRotateSpeed: 0.6 })
    expect(result.fx).toMatchObject({ bloom: { enabled: true, strength: 1.6, radius: 0.3, threshold: 0.2 },
      passes: { colorify: true }, params: { colorify: { color: '#aabbcc' } } })
  })

  it('returns new nested engine fields on every resolution and does not mutate input', () => {
    const input = { ...template, settings: { bloom: { enabled: true } } }
    const before = structuredClone(input)
    const first = resolveSceneForPlayback(input).engineScene
    ;(first.visualizer as Record<string, unknown>).shader = 'untrusted replacement'
    ;(first.controls as Record<string, unknown>).position0 = { x: 999 }
    ;((first.fx as Record<string, unknown>).passes as Record<string, unknown>).colorify = true
    const next = resolveSceneForPlayback(template).engineScene
    expect(next.visualizer).toHaveProperty('shader', getTemplateDefinition(template.templateId, 1)?.shader)
    expect(next.controls).toHaveProperty('position0', { x: 0, y: 0, z: 5.5 })
    expect(next.fx).toHaveProperty('passes.colorify', false)
    expect(next.fx).toHaveProperty('bloom.enabled', false)
    expect(input).toEqual(before)
  })

  it('keeps source untrusted even when it exactly matches a platform template', () => {
    const sourceScene = { visualizer: { shader: getTemplateDefinition(template.templateId, 1)?.shader } }
    for (const value of [sourceScene, { schemaVersion: 1, kind: 'custom', scene: sourceScene }]) {
      expect(resolveSceneForPlayback(value)).toEqual({ kind: 'custom', trust: 'untrusted', engineScene: sourceScene })
    }
  })

  it.each([
    { ...template, visualizer: { shader: 'throw new Error("injected")' } },
    { templateId: template.templateId, visualizer: { shader: 'injected' } },
    { schemaVersion: 2, visualizer: { shader: 'injected' } },
    { kind: 'typo', visualizer: { shader: 'injected' } },
    { ...template, templateVersion: 99 },
    { ...template, settings: { skybox: 'https://example.com/evil.js' } },
  ])('never falls back to legacy execution for malformed versioned data', (value) => {
    expect(() => resolveSceneForPlayback(value)).toThrow()
  })
})
