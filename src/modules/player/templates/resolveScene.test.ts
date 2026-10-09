import { describe, expect, it } from 'vitest'
import { listSceneTemplates, getTemplateDefinition } from './templateRegistry'
import { resolveSceneForPlayback } from './resolveScene'
import { validateSceneForPlayback } from '../policy/sceneValidation'
import fixtures from '../../../../contracts/scenes/fixtures.json'

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

  it('resolves every restored editor setting as bounded engine data while retaining the exact catalog source', () => {
    const document = fixtures.cases.find(item => item.name === 'expanded-settings-all-editor-controls')!.document
    const before = structuredClone(document)
    const resolved = resolveSceneForPlayback(document)
    expect(resolved.kind).toBe('template')
    expect(resolved.trust).toBe('platform-owned')
    expect(resolved.engineScene).toEqual({
      visualizer: { shader: getTemplateDefinition(template.templateId, 1)!.shader, scale: 200, skyboxPreset: 6 },
      controls: { position0: { x: -1000, y: 1000, z: 5.5 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 100 },
      intent: {
        time_multiplier: 10, minimizing_factor: 2, power_factor: 10, pointerDownMultiplier: 10,
        base_speed: 1, easing_speed: 0, camTilt: -2 * Math.PI, camOrientationMode: 2, camOrientationSpeed: 10,
        autoRotate: false, autoRotateSpeed: -50, fov: 179,
      },
      fx: {
        passOrder: ['outputPass', 'RGBShift', 'afterImagePass', 'bloom', 'colorifyShader'],
        bloom: { enabled: true, strength: 10, radius: -10, threshold: 10 },
        toneMapping: { method: 7, exposure: 10 },
        passes: {
          rgbShift: true, dot: false, technicolor: false, luminosity: false, afterImage: true,
          sobel: false, glitch: false, colorify: true, halftone: false, gammaCorrection: false,
          kaleid: false, bleachBypass: false, toon: false, outputPass: false,
        },
        params: {
          rgbShift: { amount: 0.1, angle: -2 * Math.PI }, afterImage: { damp: 1 },
          colorify: { color: '#12AbEF' }, kaleid: { sides: 24, angle: 2 * Math.PI },
        },
      },
      state: { size: 100, pointerDown: 1, currPointerDown: 0, currAudio: 100, time: 86400, volume_multiplier: 10 },
      audioResponse: 'mapped-v1',
      audioResponseConfig: { version: 1, sensitivity: 4, mappings: [
        { target: 'size', source: 'bass-hit', amount: 4, attack: 2, release: 5 },
        { target: 'bass', source: 'mid-level' }, { target: 'mid', source: 'treble-level' },
        { target: 'treble', source: 'overall-level' }, { target: 'audioLevel', source: 'bass-level' },
        { target: 'audioHit', source: 'overall-hit' },
      ] },
    })
    // Template additions obey the same V01 limits as the engine's other input.
    expect(() => validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: resolved.engineScene })).not.toThrow()
    expect(document).toEqual(before)
  })

  it('empty and sparse extension objects retain every omitted version-one engine default', () => {
    const baseline = resolveSceneForPlayback(template).engineScene
    const empty = resolveSceneForPlayback({ ...template, settings: {
      camera: {}, motion: {}, effects: { passes: {}, params: { rgbShift: {}, afterImage: {}, kaleid: {} }, toneMapping: {} }, state: {},
    } }).engineScene
    expect(empty).toEqual(baseline)
    const sparse = resolveSceneForPlayback({ ...template, settings: {
      camera: { tilt: 0.5 }, motion: { easing_speed: 0.2 }, effects: { params: { rgbShift: { amount: 0.02 } } },
    } }).engineScene
    expect(sparse).toEqual({ ...baseline,
      intent: { ...baseline.intent as object, camTilt: 0.5, easing_speed: 0.2 },
      fx: { ...baseline.fx as object, params: {
        ...(baseline.fx as { params: object }).params, rgbShift: { amount: 0.02, angle: 0 },
      } },
    })
  })

  it('keeps extension data isolated between resolutions and cannot use it to replace source', () => {
    const input = { ...template, settings: {
      effects: { passOrder: ['bloom'], passes: { rgbShift: true } },
      audioResponseConfig: { version: 1, mappings: [{ target: 'size', source: 'bass-hit' }] },
    } }
    const first = resolveSceneForPlayback(input).engineScene
    ;(first.fx as { passOrder: string[] }).passOrder.push('glitchPass')
    ;(first.audioResponseConfig as { mappings: Array<{ source: string }> }).mappings[0].source = 'tampered'
    const next = resolveSceneForPlayback(input).engineScene
    expect(next.fx).toHaveProperty('passOrder', ['bloom'])
    expect(next.audioResponseConfig).toHaveProperty('mappings.0.source', 'bass-hit')
    expect(next.visualizer).toHaveProperty('shader', getTemplateDefinition(template.templateId, 1)!.shader)
    expect(() => resolveSceneForPlayback({ ...input, settings: { ...input.settings, effects: { shader: 'custom source' } } })).toThrow()
  })

  it('keeps source untrusted even when it exactly matches a platform template', () => {
    const sourceScene = { visualizer: { shader: getTemplateDefinition(template.templateId, 1)?.shader } }
    for (const value of [{ schemaVersion: 1, kind: 'custom', scene: sourceScene }]) {
      expect(resolveSceneForPlayback(value)).toEqual({ kind: 'custom', trust: 'untrusted', engineScene: sourceScene })
    }
  })

  it.each([
    { visualizer: { shader: 'sphere(1)' } },
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
