import engineSource from '@notrac/mage?raw'
import { describe, expect, it } from 'vitest'
import { EMBEDDED_SHADER_SCENES } from './embeddedShaderScenes'

const catalogStart = engineSource.indexOf('var EMBEDDED_PRESETS = {')
const catalogEnd = engineSource.indexOf('function deepClone', catalogStart)
if (catalogStart < 0 || catalogEnd <= catalogStart) {
  throw new Error('Could not locate the installed MAGE embedded presets for catalog compatibility tests.')
}

const catalogSource = engineSource.slice(catalogStart, catalogEnd)
const presetEntries = Array.from(catalogSource.matchAll(/^\t"(\d+)": \{/gm))
const installedShaders = presetEntries.map((entry, index) => {
  const presetSource = catalogSource.slice(entry.index, presetEntries[index + 1]?.index)
  const shaderLiteral = presetSource.match(/"shader":\s*("(?:\\.|[^"\\])*")/)?.[1]
  if (!shaderLiteral) throw new Error(`Installed MAGE preset ${entry[1]} has no shader.`)
  // The JS bundle allows literal tabs inside strings; JSON requires escaping them.
  return { id: `embedded-scene-${entry[1]}`, shader: JSON.parse(shaderLiteral.replace(/\t/g, '\\t')) as string }
})

// The app formats the bundled code, omits comments, and adds optional trailing
// argument commas. These shaders have no whitespace-sensitive string literals.
const normalizeShader = (shader: string) => shader
  .replace(/\/\/[^\n]*/g, '')
  .replace(/\s+/g, '')
  .replace(/,\)/g, ')')

describe('built-in shader catalog', () => {
  it('includes every installed engine preset exactly once', () => {
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
