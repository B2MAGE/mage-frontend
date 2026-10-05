import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it, vi } from 'vitest'
import fixtureSet from '../../../../contracts/scenes/fixtures.json'
import schema from '../../../../contracts/scenes/scene-v1.schema.json'
import {
  hasSceneDocumentMarkers,
  parseSceneDocument,
  SceneContractError,
  TEMPLATE_IDS,
} from './sceneContract'

const base = {
  schemaVersion: 1,
  kind: 'template',
  templateId: 'embedded-scene-0',
  templateVersion: 1,
}
function contractValidator(useDefaults = false) {
  return new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, useDefaults })
    .addKeyword({ keyword: 'x-uniqueBy', type: 'array', schemaType: 'string',
      validate: (key: string, data: unknown[]) => new Set(data.map(item =>
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined)).size === data.length })
    .addKeyword({ keyword: 'x-maxOptionalEffects', type: 'object', schemaType: 'number',
      validate: (maximum: number, data: Record<string, unknown>) => {
        const bloom = data.bloom as { enabled?: unknown } | undefined
        const tint = data.tint as { enabled?: unknown } | undefined
        const effects = data.effects as { passes?: Record<string, unknown> } | undefined
        return Number(bloom?.enabled === true) + Number(tint?.enabled === true)
          + Object.entries(effects?.passes ?? {}).filter(([key, value]) => key !== 'outputPass' && value === true).length <= maximum
      } })
}
const validate = contractValidator().compile(schema)

describe('shared scene contract fixtures', () => {
  it.each(fixtureSet.cases)('$name', (fixture) => {
    const document = JSON.parse(JSON.stringify(fixture.document))
    const before = JSON.stringify(document)
    expect(validate(document), JSON.stringify(validate.errors)).toBe(fixture.valid)
    if (fixture.valid) {
      const parsed = parseSceneDocument(document)
      expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true)
      if ('normalized' in fixture) expect(parsed).toEqual(fixture.normalized)
    } else {
      expect(() => parseSceneDocument(document)).toThrow(SceneContractError)
    }
    expect(JSON.stringify(document)).toBe(before)
  })

  it('has a valid fixture for every immutable template ID', () => {
    const ids = fixtureSet.cases.flatMap((fixture) =>
      fixture.valid && 'templateId' in fixture.document ? [fixture.document.templateId] : [],
    )
    expect(new Set(ids)).toEqual(new Set(TEMPLATE_IDS))
    expect(schema.$defs.template.properties.templateId.enum).toEqual(TEMPLATE_IDS)
  })

  it('keeps builder scene-wide settings identical to the existing template contract', () => {
    expect(schema.$defs.builder.properties.settings).toEqual(schema.$defs.template.properties.settings)
    expect(schema.$defs.builder.properties.parameters).toEqual(schema.$defs.template.properties.parameters)
    const builderCases = fixtureSet.cases.filter(fixture => fixture.document.kind === 'builder')
    expect(builderCases.length).toBeGreaterThanOrEqual(48)
    const operations = builderCases.flatMap(fixture => fixture.valid && 'objects' in fixture.document
      ? (fixture.document.objects ?? []).flatMap(object => 'operation' in object && object.operation ? [object.operation.type] : []) : [])
    expect(new Set(operations)).toEqual(new Set(['sphere', 'box', 'torus', 'cylinder']))
  })

  it('materializes exactly the defaults published for other contract consumers', () => {
    const materializeDefaults = contractValidator(true).compile(schema.$defs.template)
    for (const fixture of fixtureSet.cases) {
      if (!fixture.valid || fixture.document.kind !== 'template') continue
      const withSchemaDefaults = JSON.parse(JSON.stringify(fixture.document))
      expect(materializeDefaults(withSchemaDefaults)).toBe(true)
      expect(parseSceneDocument(fixture.document)).toEqual(withSchemaDefaults)
    }
  })
})

describe('template object boundary', () => {
  it.each([NaN, Infinity, -Infinity, undefined, () => 1, Symbol('value'), 1n])(
    'rejects non-JSON parameter values (%s)',
    (scale) => expect(() => parseSceneDocument({ ...base, parameters: { scale } })).toThrow(SceneContractError),
  )

  it.each([new Date(), new Map(), new Set(), /code/, Object.create({ scale: 10 })])(
    'rejects objects with a non-JSON prototype (%s)',
    (parameters) => expect(() => parseSceneDocument({ ...base, parameters })).toThrow(SceneContractError),
  )

  it('reads no getter, including known, unknown, and non-enumerable fields', () => {
    const getter = vi.fn(() => 10)
    const documents = [
      Object.defineProperty({ ...base }, 'kind', { get: getter, enumerable: true }),
      { ...base, parameters: Object.defineProperty({}, 'scale', { get: getter, enumerable: true }) },
      { ...base, settings: Object.defineProperty({}, 'unknown', { get: getter, enumerable: true }) },
      Object.defineProperty({ ...base }, 'hidden', { get: getter }),
    ]
    for (const document of documents) expect(() => parseSceneDocument(document)).toThrow(SceneContractError)
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects symbol and non-enumerable properties instead of silently dropping them', () => {
    expect(() => parseSceneDocument({ ...base, parameters: { [Symbol('source')]: 'code' } })).toThrow(SceneContractError)
    const settings = Object.defineProperty({}, 'source', { value: 'code' })
    expect(() => parseSceneDocument({ ...base, settings })).toThrow(SceneContractError)
  })

  it('accepts null-prototype data objects and returns ordinary fresh objects', () => {
    const document = Object.assign(Object.create(null), base, {
      parameters: Object.assign(Object.create(null), { scale: 12 }),
    })
    const parsed = parseSceneDocument(document)
    expect(parsed.kind).toBe('template')
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(parsed).not.toBe(document)
    if (parsed.kind === 'template') {
      expect(Object.getPrototypeOf(parsed.parameters)).toBe(Object.prototype)
      expect(parsed.parameters.scale).toBe(12)
    }
  })

  it('returns fresh defaults and never mutates the input', () => {
    const input = Object.freeze({ ...base, settings: Object.freeze({ camera: Object.freeze({ fov: 60 }) }) })
    const first = parseSceneDocument(input)
    const second = parseSceneDocument(input)
    if (first.kind !== 'template' || second.kind !== 'template') throw new Error('expected templates')
    first.settings.camera.fov = 30
    first.parameters.scale = 1
    expect(second.settings.camera.fov).toBe(60)
    expect(second.parameters.scale).toBe(10)
    expect(input.settings.camera.fov).toBe(60)
  })
})

describe('custom documents remain untrusted JSON', () => {
  it('labels and clones source without promoting it to a template', () => {
    const scene = { visualizer: { shader: 'arbitrary source', uniforms: [1, 2, 3] } }
    const parsed = parseSceneDocument({ schemaVersion: 1, kind: 'custom', scene })
    expect(parsed).toEqual({ schemaVersion: 1, kind: 'custom', scene })
    expect(parsed.kind).toBe('custom')
    if (parsed.kind !== 'custom') throw new Error('expected custom')
    expect(parsed.scene).not.toBe(scene)
    expect(parsed.scene.visualizer).not.toBe(scene.visualizer)
  })

  it('rejects cyclic data and sparse or extended arrays', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const extended = Object.assign([1], { source: 'code' })
    for (const value of [cycle, Array(2), [undefined], extended]) {
      expect(() => parseSceneDocument({ schemaVersion: 1, kind: 'custom', scene: { value } })).toThrow(SceneContractError)
    }
  })

  it('rejects accessors on arrays without calling them', () => {
    const getter = vi.fn(() => 10)
    const values = [1]
    Object.defineProperty(values, '0', { get: getter, enumerable: true })
    expect(() => parseSceneDocument({ schemaVersion: 1, kind: 'custom', scene: { values } })).toThrow(SceneContractError)
    expect(getter).not.toHaveBeenCalled()
  })

  it('allows repeated ordinary JSON values without mistaking them for cycles', () => {
    const reused = { value: 1 }
    const parsed = parseSceneDocument({ schemaVersion: 1, kind: 'custom', scene: { a: reused, b: reused } })
    expect(parsed).toEqual({ schemaVersion: 1, kind: 'custom', scene: { a: { value: 1 }, b: { value: 1 } } })
    if (parsed.kind === 'custom') expect(parsed.scene.a).not.toBe(parsed.scene.b)
  })
})

describe('scene document marker detection', () => {
  it.each(['schemaVersion', 'kind', 'templateId', 'templateVersion'])(
    'recognizes the %s marker even if its value is invalid',
    (key) => {
      expect(hasSceneDocumentMarkers({ [key]: undefined })).toBe(true)
      expect(() => parseSceneDocument({ [key]: undefined })).toThrow(SceneContractError)
    },
  )

  it('detects inherited markers so malformed envelopes cannot fall through to legacy playback', () => {
    const document = Object.create(base)
    expect(hasSceneDocumentMarkers(document)).toBe(true)
    expect(() => parseSceneDocument(document)).toThrow(SceneContractError)
  })

  it('never invokes a marker accessor', () => {
    const getter = vi.fn(() => 'template')
    const document = Object.defineProperty({}, 'kind', { get: getter, enumerable: true })
    expect(hasSceneDocumentMarkers(document)).toBe(true)
    expect(() => parseSceneDocument(document)).toThrow(SceneContractError)
    expect(getter).not.toHaveBeenCalled()
  })

  it.each([null, undefined, 1, 'source', [], {}, { visualizer: { shader: 'source' } }])(
    'does not label ordinary legacy values as versioned documents (%s)',
    (value) => expect(hasSceneDocumentMarkers(value)).toBe(false),
  )
})
