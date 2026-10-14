import { describe, expect, it } from 'vitest'
import { validateBuilderDriverExpression, type BuilderDriverSource } from '@modules/player'
import schema from '../../../contracts/scenes/scene-v1.schema.json'
import { BUILDER_INPUTS, DRIVER_SOURCES } from './builderInputDefinitions'
import { BUILDER_BINDING_SOURCE_LABELS } from './builderBindings'
import { driverInput } from './builderDrivers'

describe('shared Builder input descriptions', () => {
  it('describes exactly the current contract inputs with the types accepted by independent validation', () => {
    const sources = schema.$defs.builderDriverExpression.anyOf.find(branch => branch.properties.type.const === 'input')!.properties.source!.enum
    expect(Object.keys(BUILDER_INPUTS).sort()).toEqual([...sources].sort())
    for (const source of sources as BuilderDriverSource[]) {
      expect(validateBuilderDriverExpression({ type: 'input', source }).type).toBe(BUILDER_INPUTS[source].valueType)
    }
  })

  it('keeps simple influence choices scalar and preserves their existing pointer and band order', () => {
    for (const { value } of DRIVER_SOURCES) expect(validateBuilderDriverExpression(driverInput(value)).type).toBe('scalar')
    expect(DRIVER_SOURCES.slice(0, 5)).toEqual([
      { value: 'time', label: 'Time' }, { value: 'scene-size', label: 'Scene size response' },
      { value: 'scene-pointer-down', label: 'Scene pointer press' },
      { value: 'scene-pointer.x', label: 'Scene pointer horizontal' }, { value: 'scene-pointer.y', label: 'Scene pointer vertical' },
    ])
    expect(Object.keys(BUILDER_BINDING_SOURCE_LABELS)).toEqual([
      'bass-level', 'mid-level', 'treble-level', 'overall-level', 'bass-hit', 'mid-hit', 'treble-hit', 'overall-hit',
      'pointer-x', 'pointer-y', 'pointer-down',
    ])
    expect(DRIVER_SOURCES.find(source => source.value === 'group-position.z')?.label).toBe('Parent group position Z')
  })
})
