import { describe, expect, it } from 'vitest'
import { parseSceneDocument, type TemplateSceneDocument } from './sceneContract'
import { createCustomSceneFromTemplate, readTemplateShaderSource } from './templateSource'
import { resolveSceneForPlayback } from './resolveScene'

describe('template shader editing', () => {
  it('copies the exact saved appearance and marks changed source untrusted without executing it', () => {
    const template = parseSceneDocument({ schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1,
      parameters: { scale: 29, speed: 3 }, settings: { camera: { fov: 85 }, bloom: { strength: 1.3 },
        effects: { passes: { rgbShift: true } }, audioResponse: 'mapped-v1' },
    }) as TemplateSceneDocument
    const before = structuredClone(template)
    const original = resolveSceneForPlayback(template).engineScene
    expect(readTemplateShaderSource(template)).toBe((original.visualizer as Record<string, unknown>).shader)
    const source = 'throw new Error("must remain text")'
    const custom = createCustomSceneFromTemplate(template, source)
    expect(custom).toEqual({ schemaVersion: 1, kind: 'custom', scene: {
      ...original, visualizer: { ...(original.visualizer as Record<string, unknown>), shader: source },
    } })
    expect(resolveSceneForPlayback(custom).trust).toBe('untrusted')
    expect(template).toEqual(before)
  })

  it('never substitutes another template version', () => {
    expect(() => readTemplateShaderSource({ templateId: 'reaction-rings-v1', templateVersion: 99 as 1 })).toThrow('Unknown template')
  })
})
