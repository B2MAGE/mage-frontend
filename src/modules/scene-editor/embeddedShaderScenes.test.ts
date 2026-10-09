import engineSource from '@notrac/mage?raw'
import { describe, expect, it } from 'vitest'
import { EMBEDDED_SHADER_SCENES } from './embeddedShaderScenes'

// The engine does not expose its embedded catalog as public API. Read only the
// bundled JSON resource regions, independently of generated variable names.
const presetEntries = Array.from(engineSource.matchAll(
  /^\/\/#region resources\/presets\/preset(\d+)\/preset(\.v2)?\.json\r?\n([\s\S]*?)(?=^\/\/#endregion)/gm,
))
if (presetEntries.length === 0) throw new Error('Installed MAGE preset resources were not found.')
const installedById = new Map<number, { id: string; shader: string; currentFormat: boolean }>()
for (const entry of presetEntries) {
  const presetSource = entry[3]
  const shaderLiteral = presetSource.match(/"shader":\s*("(?:\\.|[^"\\])*")/)?.[1]
  if (!shaderLiteral) throw new Error(`Installed MAGE preset ${entry[1]} has no shader.`)
  const id = Number(entry[1])
  const currentFormat = Boolean(entry[2])
  if (installedById.get(id)?.currentFormat && !currentFormat) continue
  // The JS bundle allows literal tabs inside strings; JSON requires escaping them.
  installedById.set(id, { id: `embedded-scene-${id}`, currentFormat,
    shader: JSON.parse(shaderLiteral.replace(/\t/g, '\\t')) as string })
}
const installedShaders = [...installedById].sort(([left], [right]) => left - right).map(([, scene]) => scene)

// The app formats the bundled code, omits comments, and adds optional trailing
// argument commas. These shaders have no whitespace-sensitive string literals.
const normalizeShader = (shader: string) => shader
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\s+/g, '')
  .replace(/,\)/g, ')')

describe('built-in shader catalog', () => {
  it('includes every installed engine preset exactly once', () => {
    expect(installedShaders).toHaveLength(14)
    expect(EMBEDDED_SHADER_SCENES.map((scene) => scene.id)).toEqual(installedShaders.map((scene) => scene.id))
    expect(new Set(EMBEDDED_SHADER_SCENES.map((scene) => scene.id)).size).toBe(EMBEDDED_SHADER_SCENES.length)
  })

  it.each(installedShaders)('preserves the installed shader source for $id', ({ id, shader }) => {
    const scene = EMBEDDED_SHADER_SCENES.find((candidate) => candidate.id === id)
    expect(scene).toBeDefined()
    expect(normalizeShader(scene!.shader)).toBe(normalizeShader(shader))
  })

  it('provides only shader choices, without overwriting camera or effect settings', () => {
    for (const scene of EMBEDDED_SHADER_SCENES) {
      expect(Object.keys(scene).sort()).toEqual(['description', 'id', 'label', 'shader'])
      expect(scene.label.trim()).not.toBe('')
      expect(scene.description.trim()).not.toBe('')
    }
  })

  it('names the newly exposed twin-ring preset Rose Circuit', () => {
    const scene = EMBEDDED_SHADER_SCENES.find((candidate) => candidate.id === 'embedded-scene-13')
    const engineScene = installedShaders.find((candidate) => candidate.id === 'embedded-scene-13')
    expect(scene?.label).toBe('Rose Circuit')
    expect(scene?.shader.trim().split('\n').map((line) => line.trim()).join('\n')).toBe(engineScene?.shader)
    expect(scene?.shader.match(/torus\(/g)).toHaveLength(2)
    expect(scene?.shader.match(/cylinder\(/g)).toHaveLength(1)
  })
})
