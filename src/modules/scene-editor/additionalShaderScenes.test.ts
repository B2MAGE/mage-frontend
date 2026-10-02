import engineSource from '@notrac/mage?raw'
import { describe, expect, it, vi } from 'vitest'
import { ADDITIONAL_SHADER_SCENES } from './additionalShaderScenes'

function sourceFingerprint(source: string) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619) >>> 0
  }
  return `${source.length}:${hash.toString(16)}`
}

function installedCompiler() {
  const start = engineSource.indexOf('var require_shader_park_core_umd =')
  const end = engineSource.indexOf('\n//#endregion', start)
  if (start < 0 || end <= start) throw new Error('Installed ShaderPark compiler was not found.')
  type CommonModule = { exports: Record<string, unknown> }
  const commonJS = (factory: (exports: CommonModule['exports'], module: CommonModule) => void) => () => {
    const module: CommonModule = { exports: {} }
    factory(module.exports, module)
    return module.exports
  }
  return new Function('__commonJSMin', 'console', `${engineSource.slice(start, end)}; return require_shader_park_core_umd();`)(commonJS, { log: vi.fn(), warn: vi.fn(), error: vi.fn() }) as {
    sculptToGLSL: (source: string) => { error?: unknown; geoGLSL: string; colorGLSL: string }
  }
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

  const compiler = installedCompiler()
  it.each(ADDITIONAL_SHADER_SCENES)('compiles authored geometry for $label', ({ id, shader }) => {
    const result = compiler.sculptToGLSL(shader)
    expect(result.error).toBeUndefined()
    expect(result.geoGLSL).toContain('surfaceDistance')
    expect(result.geoGLSL).toContain(id === 'reaction-rings-v1' ? '= torus(' : '= cylinder(')
    expect(result.colorGLSL.length).toBeGreaterThan(0)
  })
})
