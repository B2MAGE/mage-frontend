import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { compileBuilderDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderGroup, type BuilderSceneDocument } from './sceneContract'

/** Read only the native group-distance updates from packaged GLSL. Coordinates
 * and primitives are deliberately outside this probe: its input is the signed
 * distance already computed by the group's children. Unknown updates fail.
 */
function compiledGroupModifiers(modifiers: NonNullable<BuilderGroup['modifiers']>) {
  const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'sphere', operation: { type: 'sphere', radius: 1 } }],
    composition: { version: 1, roots: ['group'], groups: [{ id: 'group', children: ['sphere'], modifiers }] },
  }) as BuilderSceneDocument
  const artifact = compileShader(compileBuilderDocument(scene).shader)
  const body = artifact.geoGLSL.slice(artifact.geoGLSL.lastIndexOf('float surfaceDistance'))
  const scalarDeclarations = new Map<string, string>()
  const updates: { scope: string; type: 'expand' | 'shell'; amount: string }[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const declaration = line.match(/^float (\w+) = (.+);$/)
    if (declaration) scalarDeclarations.set(declaration[1], declaration[2])
    const expand = line.match(/^(scope_\d+_d) -= (.+);$/)
    if (expand) updates.push({ scope: expand[1], type: 'expand', amount: expand[2] })
    const shell = line.match(/^(scope_\d+_d) = shell\( \1,(.+)\);$/)
    if (shell) updates.push({ scope: shell[1], type: 'shell', amount: shell[2] })
  }
  expect(updates.map(update => update.type)).toEqual(modifiers.map(modifier => modifier.type))
  expect(new Set(updates.map(update => update.scope)).size).toBe(1)
  // In particular, no union with the old distance may follow a modifier in its
  // own scope. A parent receiving the finished child group is still a union.
  const groupScope = updates[0].scope
  const lines = body.split('\n')
  const lastModifier = lines.reduce((last, line, index) => line.trim().startsWith(`${groupScope} -=`)
    || line.trim().startsWith(`${groupScope} = shell(`) ? index : last, -1)
  expect(lines.slice(lastModifier + 1).join('\n')).not.toMatch(new RegExp(`${groupScope} = add\\(`))
  const evaluate = (expression: string): number => {
    const variables = [...new Set(expression.match(/\b[a-zA-Z_]\w*\b/g) ?? [])]
    const values = variables.map(name => {
      const declaration = scalarDeclarations.get(name)
      if (!declaration) throw new Error(`Unexpected scalar dependency ${name}`)
      return evaluate(declaration)
    })
    // Input is packaged compiler output from the fixed validated scene above.
    return new Function(...variables, `return ${expression};`)(...values) as number
  }
  return (distance: number) => updates.reduce((value, update) => update.type === 'expand'
    ? value - evaluate(update.amount) : Math.abs(value) - evaluate(update.amount), distance)
}

describe('packaged group distance modifier updates', () => {
  it('negative expansion shrinks the completed group, including points inside it', () => {
    const sample = compiledGroupModifiers([{ type: 'expand', amount: -.25 }])
    for (const distance of [-1, -.05, 0, .2]) expect(sample(distance)).toBeCloseTo(distance + .25)
    expect(sample(-.05)).toBeGreaterThan(0)
  })

  it('shell replaces the group interior with positive distance instead of retaining a filled union', () => {
    const sample = compiledGroupModifiers([{ type: 'shell', thickness: .1 }])
    for (const distance of [-1, -.05, 0, .2]) expect(sample(distance)).toBeCloseTo(Math.abs(distance) - .1)
    expect(sample(-1)).toBeCloseTo(.9)
  })

  it('preserves authored modifier order at the compiled distance boundary', () => {
    const expandFirst = compiledGroupModifiers([{ type: 'expand', amount: -.25 }, { type: 'shell', thickness: .1 }])
    const shellFirst = compiledGroupModifiers([{ type: 'shell', thickness: .1 }, { type: 'expand', amount: -.25 }])
    for (const distance of [-1, -.05, 0, .2]) {
      expect(expandFirst(distance)).toBeCloseTo(Math.abs(distance + .25) - .1)
      expect(shellFirst(distance)).toBeCloseTo(Math.abs(distance) - .1 + .25)
    }
    expect(expandFirst(-1)).not.toBeCloseTo(shellFirst(-1))
  })
})
