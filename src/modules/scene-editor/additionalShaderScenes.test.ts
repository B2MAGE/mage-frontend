import { compileShader } from '@notrac/mage/compiler'
import { describe, expect, it } from 'vitest'
import { ADDITIONAL_SHADER_SCENES } from './additionalShaderScenes'

function sourceFingerprint(source: string) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619) >>> 0
  }
  return `${source.length}:${hash.toString(16)}`
}

describe('additional fixed shader presets', () => {
  it('preserves the default shader source byte-for-byte after retiring editable template parameters', () => {
    expect(ADDITIONAL_SHADER_SCENES.map(scene => ({
      id: scene.id,
      label: scene.label,
      fingerprint: sourceFingerprint(scene.shader),
    }))).toEqual([
      { id: 'reaction-rings-v1', label: 'Ripple Rings', fingerprint: '1824:523ef4c6' },
      { id: 'reaction-lantern-v1', label: 'Tidal Lantern', fingerprint: '4916:15ec0b8a' },
    ])
    for (const scene of ADDITIONAL_SHADER_SCENES) {
      expect(Object.keys(scene).sort()).toEqual(['description', 'id', 'label', 'shader'])
    }
  })

  it.each(ADDITIONAL_SHADER_SCENES)('compiles authored geometry for $label', ({ id, shader }) => {
    const result = compileShader(shader)
    expect(result.geoGLSL).toContain('surfaceDistance')
    expect(result.geoGLSL).toContain(id === 'reaction-rings-v1' ? '= torus(' : '= cylinder(')
    expect(result.colorGLSL.length).toBeGreaterThan(0)
  })
})
