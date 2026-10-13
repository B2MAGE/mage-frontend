import { describe, expect, it } from 'vitest'
import { builderColorChannels, builderColorHex, parseSceneDocument, validateBuilderDriverExpression, type BuilderSceneDocument } from '@modules/player'
import { createBuilderScene, updateBuilderObject } from './builderEditor'
import { builderGroupingIssue, duplicateBuilderNode, groupBuilderNodes, ungroupBuilderNode, updateBuilderGroup } from './builderGroups'
import { driverTargets, readDriverPreset } from './builderDrivers'
import { addNoiseDeformation, addProceduralColor, createNoiseExpression, defaultNoiseValues, readNoiseExpression } from './builderProcedural'

describe('Builder procedural authoring', () => {
  it('preserves precise signed linear color through swatch display and document parsing', () => {
    const color = { x: .08256470259178794, y: -.782309705948631, z: .763003005740327 }
    const document = createBuilderScene()
    document.objects[0].material.color = color
    expect(builderColorHex(color)).toMatch(/^#[0-9a-f]{6}$/)
    expect(builderColorChannels(color)).toEqual([color.x, color.y, color.z])
    expect(parseSceneDocument(document)).toEqual(document)
  })

  it('authors scoped noise with independent frequency, strength, offset and drift using bounded ordinary expressions', () => {
    const values = { ...defaultNoiseValues(), scope: 'group-position' as const, ancestor: 3,
      frequency: 1.768209282106819, strength: -.030656382800295368,
      offset: { x: .2, y: 0, z: -.3 }, drift: { x: 0, y: .1, z: .2 } }
    const expression = createNoiseExpression(values)
    expect(readNoiseExpression(expression)).toEqual(values)
    expect(validateBuilderDriverExpression(expression).type).toBe('scalar')
    expect(readDriverPreset({ type: 'component', input: { type: 'input', source: 'group-position', ancestor: 3 }, axis: 'x' })).toBeNull()
    expect(readNoiseExpression({ type: 'noise', input: { type: 'multiply', left: { type: 'input', source: 'world-position' }, right: { type: 'constant', value: .7369379972723424 } } }))
      .toMatchObject({ scope: 'world-position', frequency: .7369379972723424, strength: 1 })
  })

  it('creates editable procedural color and expansion with contextual targets and cleans up removed targets', () => {
    let document = createBuilderScene()
    expect(driverTargets(document.objects[0]).map(target => target.value)).not.toContain('modifier.expand.amount')
    document = updateBuilderObject(document, document.objects[0].id, object => addProceduralColor(addNoiseDeformation(object), 'view-ray'))
    expect(document.objects[0].drivers).toHaveLength(4)
    expect(driverTargets(document.objects[0]).map(target => target.value)).toContain('modifier.expand.amount')
    expect(parseSceneDocument(document)).toEqual(document)
    document = updateBuilderObject(document, document.objects[0].id, object => ({ ...object, modifiers: [] }))
    expect(document.objects[0].drivers?.map(driver => driver.target)).toEqual(['material.color.r', 'material.color.g', 'material.color.b'])
  })

  it('permits a single-object deformation group, clones it without shared data, and refuses destructive flattening', () => {
    const document = createBuilderScene()
    expect(builderGroupingIssue(document, [document.objects[0].id])).toBeNull()
    let grouped = groupBuilderNodes(document, [document.objects[0].id], 'group-1')
    grouped = updateBuilderGroup(grouped, 'group-1', group => addNoiseDeformation(group))
    expect(parseSceneDocument(grouped)).toEqual(grouped)
    expect(() => ungroupBuilderNode(grouped, 'group-1')).toThrow(/joined surface/)
    let sequence = 10
    const copy = duplicateBuilderNode(grouped, 'group-1', kind => `${kind}-${sequence++}`)
    copy.composition!.groups[1].modifiers![0] = { type: 'expand', amount: 1 }
    expect(grouped.composition!.groups[0].modifiers).toEqual([{ type: 'expand', amount: 0 }])
    const clean = updateBuilderGroup(grouped, 'group-1', group => ({ ...group, modifiers: [] }))
    expect(clean.composition!.groups[0].drivers).toEqual([])
    expect(parseSceneDocument(ungroupBuilderNode(clean, 'group-1'))).toEqual(ungroupBuilderNode(clean, 'group-1'))
  })

  it('retains all color influences through JSON export and reimport', () => {
    const document = createBuilderScene()
    document.objects[0] = addProceduralColor(document.objects[0], 'animated')
    const restored = parseSceneDocument(JSON.parse(JSON.stringify(document))) as BuilderSceneDocument
    expect(restored.objects[0].drivers).toEqual(document.objects[0].drivers)
    expect(restored.objects[0].drivers).toHaveLength(3)
  })
})
