import { describe, expect, it } from 'vitest'
import fixtures from '../../../../contracts/scenes/current-round-trips.json'
import { parseSceneImport, validateSceneForStorage } from '../policy/sceneValidation'
import { compileBuilderDocument } from './builderCompiler'

describe('current scene full-write contract shared with the API', () => {
  it.each(fixtures.cases)('$name', fixture => {
    const input: unknown = structuredClone(fixture.input)
    const before = JSON.stringify(input)
    if (!fixture.valid) {
      expect(() => validateSceneForStorage(input)).toThrow()
      expect(() => parseSceneImport(before)).toThrow()
    } else {
      const normalized = validateSceneForStorage(input)
      expect(normalized).toEqual(fixture.normalized)
      expect(parseSceneImport(JSON.stringify(normalized))).toEqual(normalized)
      expect(validateSceneForStorage(normalized)).toEqual(normalized)
      if (normalized.kind === 'builder' && fixture.renderingWorkload) {
        expect(compileBuilderDocument(normalized).workload).toMatchObject(fixture.renderingWorkload)
      }
    }
    expect(JSON.stringify(input)).toBe(before)
  })
})
