import { initMAGE } from '@notrac/mage'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import engineSource from '@notrac/mage?raw'
import { describe, expect, it, vi } from 'vitest'

// Exercise installed methods with only private-field spelling changed, as in
// the existing engine lifecycle tests; actual shader/material creation is used.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Harness = Record<string, any>
const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
function method(name: string, dependencies: Harness = {}) {
  const start = engineSource.indexOf(`\n\t${name}(`, engineStart)
  const end = engineSource.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed method ${name}`)
  const source = engineSource.slice(start + 2, end + 3).replace(/^static /, '').replaceAll('.#', '.')
  return new Function(...Object.keys(dependencies), `return ${source.startsWith('async ') ? 'async function ' + source.slice(6) : 'function ' + source}`)(...Object.values(dependencies))
}
function fixture() {
  const real = initMAGE({ renderBudget: { maxRaymarchIterations: 48 } }) as unknown as Harness
  const visualizer = real.getEngineFields().visualizer
  const preset = { from: (value: unknown) => value }
  const load = method('loadPreset', { MAGEPreset: preset })
  const engine: Harness = { visualizer, isDisposed: false, renderBudget: { maxRaymarchIterations: 48 },
    setAudioResponseMode: vi.fn(), controls: {}, controlSettings: { active: false },
    fx: { bleachBypassShader: {}, toonShader: {} }, _updateVisualizer: vi.fn(),
    _syncPostProcessingFromState: vi.fn(), _syncSobelResolution: vi.fn() }
  const loadCompiled = method('loadCompiledPreset', { normalizeCompiledShader, MAGEPreset: preset, MAGEEngine: { prototype: { loadPreset: load } } })
  return { real, visualizer, engine, loadCompiled }
}

describe('installed compiled-artifact rendering', () => {
  it('keeps source inert, preserves its metadata and updates trusted audio/time/pointer uniforms', () => {
    const f = fixture()
    const artifact = compileShader('let bass=input(0.2,0,1); let pointerDown=input(0); sphere(0.5+bass+time*0.01);')
    const source = 'throw new Error("source must never be evaluated in the renderer");'
    const preset = { visualizer: { shader: source } }
    expect(f.loadCompiled.call(f.engine, preset, artifact)).toBe(preset)
    expect(f.visualizer.getActiveShader()).toBe(source)
    expect(f.visualizer.shaders).toHaveLength(1)
    const material = f.visualizer.mesh.material
    expect(material.fragmentShader).toContain('MAX_ITERATIONS = 48;')
    const fields = f.real.getEngineFields()
    fields.state.time = 3
    fields.state.pointerDown = 0.7
    vi.spyOn(f.real, 'getAudioResponseOutputs').mockReturnValue({ bass: 0.8 })
    f.visualizer.mesh.onBeforeRender(null, null, null, null, material, null)
    expect(material.uniforms.time.value).toBe(3)
    expect(material.uniforms.bass.value).toBe(0.8)
    expect(material.uniforms.pointerDown.value).toBe(0.7)
    expect(f.engine._updateVisualizer).toHaveBeenCalledOnce()
  })

  it('fails closed before loading metadata and never retries a broken artifact through source compilation', () => {
    const f = fixture(), sourceLoader = vi.spyOn(f.visualizer, 'load')
    expect(() => f.loadCompiled.call(f.engine, { visualizer: { shader: 'sphere(1);' } }, { version: 1 })).toThrow(/compiled shader/)
    expect(sourceLoader).not.toHaveBeenCalled()
    expect(f.visualizer.mesh).toBeNull()
    expect(() => f.loadCompiled.call(f.engine, {}, compileShader('sphere(1);'))).toThrow(/metadata/)
    expect(sourceLoader).not.toHaveBeenCalled()
    f.engine.isDisposed = true
    expect(() => f.loadCompiled.call(f.engine, { visualizer: { shader: 'sphere(1);' } }, compileShader('sphere(1);'))).toThrow(/stopped/)
  })

  it('passes the retained artifact into thumbnail capture and rejects a different uncompiled source', async () => {
    const f = fixture(), artifact = compileShader('sphere(1);')
    const preset = { visualizer: { shader: 'throw new Error("inert thumbnail source");' } }
    f.loadCompiled.call(f.engine, preset, artifact)
    const capture = vi.fn<(preset: unknown, options: unknown, artifact: unknown) => Promise<string>>(async () => 'data:image/png;base64,fixture')
    const thumbnail = method('async captureThumbnail', { MAGEPreset: { from: (value: unknown) => value }, MAGEEngine: { captureThumbnail: capture } })
    await expect(thumbnail.call(f.engine, preset)).resolves.toContain('data:image/png')
    expect(capture.mock.calls[0][2]).toBe(f.visualizer.compiledArtifact)
    await expect(thumbnail.call(f.engine, { visualizer: { shader: 'sphere(2);' } })).rejects.toThrow(/Compile/)
    expect(capture).toHaveBeenCalledOnce()
  })
})
