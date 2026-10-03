import { describe, expect, it, vi } from 'vitest'
import builtin from './fixtures/builtin-presets.json'
import quality from './fixtures/demo-quality.json'
import contractFixtures from '../../../../contracts/scenes/fixtures.json'
import { resolveSceneForPlayback } from '../templates/resolveScene'
import { TEMPLATE_IDS } from '../templates/sceneContract'
import { BRAND_SCENE } from '../templates/platformBrandScene'
import {
  assertSceneRequestBudget, parseSceneImport, SCENE_LIMITS, SCENE_POLICY, SCENE_RUNTIME_CEILINGS,
  SceneValidationError, validateSceneDocument, validateSceneForPlayback,
} from './sceneValidation'

const raw = (shader = 'sphere(0.5);') => ({ visualizer: { shader } })
const custom = (scene: unknown = raw()) => ({ schemaVersion: 1, kind: 'custom', scene })
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
function rejects(value: unknown, path: string, message?: string) {
  try { validateSceneDocument(value); expect.fail('Expected scene validation to reject the input') }
  catch (error) {
    expect(error).toBeInstanceOf(SceneValidationError)
    expect((error as SceneValidationError).details[path]).toEqual(expect.any(String))
    if (message) expect((error as Error).message).toContain(message)
  }
}

describe('shared scene submission preflight', () => {
  it('accepts the same 116-scene corpus as the backend without modifying source', () => {
    const corpus = [...builtin, ...quality]
    expect(corpus).toHaveLength(116)
    for (const row of corpus) {
      const before = JSON.stringify(row.sceneData)
      expect(validateSceneForPlayback(row.sceneData), row.sceneId).toEqual(custom(row.sceneData))
      expect(JSON.stringify(row.sceneData)).toBe(before)
    }
  })

  it.each(TEMPLATE_IDS)('accepts immutable template %s and its resolved engine payload', templateId => {
    const document = validateSceneDocument({ ...template, templateId })
    expect(document.kind).toBe('template')
    expect(validateSceneForPlayback(resolveSceneForPlayback(document).engineScene).kind).toBe('custom')
  })

  it('validates platform artwork using the same data policy', () => {
    expect(validateSceneForPlayback(BRAND_SCENE).kind).toBe('custom')
  })

  it.each(contractFixtures.cases.filter(fixture => fixture.document.kind === 'template' || !fixture.valid))(
    'honors B01 fixture $name', fixture => {
      if (fixture.valid) {
        const result = validateSceneDocument(fixture.document)
        if ('normalized' in fixture) expect(result).toEqual(fixture.normalized)
      } else expect(() => validateSceneDocument(fixture.document)).toThrow(SceneValidationError)
    },
  )

  it('labels legacy raw data only as custom and requires an explicit contract on strict writes', () => {
    const source = raw()
    expect(validateSceneForPlayback(source)).toEqual(custom(source))
    expect(() => validateSceneDocument(source)).toThrow('schemaVersion')
    expect(() => validateSceneForPlayback(source, { allowLegacyRaw: false })).toThrow('schemaVersion')
    expect(validateSceneDocument(custom(source))).toEqual(custom(source))
  })

  it('never executes source or changes a valid custom document', () => {
    const source = 'throw new Error("must never execute"); while (true) {}'
    const document = Object.freeze(custom(Object.freeze({ visualizer: Object.freeze({ shader: source }) })))
    expect(validateSceneDocument(document)).toEqual(document)
    expect(validateSceneDocument(document)).not.toBe(document)
  })

  it.each(['x', 'é', '😀'])('enforces exact UTF-8 shader byte boundaries for %s', char => {
    const source = char.repeat(SCENE_LIMITS.sourceBytes / new TextEncoder().encode(char).length)
    expect(validateSceneDocument(custom(raw(source)))).toEqual(custom(raw(source)))
    rejects(custom(raw(`${source}x`)), 'sceneData.scene.visualizer.shader', '65536')
  })

  it.each(['\ud800', '\udfff', 'ok\ud800x'])('rejects unpaired source surrogates without silently replacing them', shader => {
    rejects(custom(raw(shader)), 'sceneData.scene.visualizer.shader', 'Unicode')
  })

  it('counts escaped JSON bytes including the envelope at the exact scene boundary', () => {
    const base = bytes(custom(raw('')))
    const room = SCENE_LIMITS.sceneBytes - base
    const shader = '\0'.repeat(Math.floor(room / 6)) + 'x'.repeat(room % 6)
    const document = custom(raw(shader))
    expect(bytes(document)).toBe(SCENE_LIMITS.sceneBytes)
    expect(validateSceneDocument(document)).toEqual(document)
    rejects(custom(raw(`${shader}x`)), 'sceneData', '262144')
  })

  it.each([
    [{ visualizer: { shader: 'x', scale: 201 } }, 'sceneData.scene.visualizer.scale'],
    [{ visualizer: { shader: 'x', scale: '10' } }, 'sceneData.scene.visualizer.scale'],
    [{ visualizer: { shader: 'x', skyboxPreset: 1.5 } }, 'sceneData.scene.visualizer.skyboxPreset'],
    [{ visualizer: { shader: ' ' } }, 'sceneData.scene.visualizer.shader'],
    [{ visualizer: {} }, 'sceneData.scene.visualizer.shader'],
    [{ ...raw(), controls: {} }, 'sceneData.scene.controls.position0'],
    [{ ...raw(), intent: { autoRotate: 'false' } }, 'sceneData.scene.intent.autoRotate'],
    [{ ...raw(), intent: { fov: 180 } }, 'sceneData.scene.intent.fov'],
    [{ ...raw(), fx: { toneMapping: { method: 5 } } }, 'sceneData.scene.fx.toneMapping.method'],
    [{ ...raw(), fx: { bloom: { enabled: false, strength: 11 } } }, 'sceneData.scene.fx.bloom.strength'],
    [{ ...raw(), fx: { params: { colorify: { color: 'red' } } } }, 'sceneData.scene.fx.params.colorify.color'],
    [{ ...raw(), renderer: { pixelRatio: 99 } }, 'sceneData.scene.renderer'],
    [{ ...raw(), shader: 'source alias' }, 'sceneData.scene.shader'],
    [{ ...raw(), assetUrl: 'https://example.test/asset' }, 'sceneData.scene.assetUrl'],
  ])('rejects invalid original settings rather than normalizing them: %j', (scene, path) => rejects(custom(scene), path as string))

  it('counts enabled optional effects including bloom, excluding output, and rejects duplicate/unknown passes', () => {
    const four = { ...raw(), fx: { bloom: { enabled: true }, passes: { rgbShift: true, dot: true, colorify: true, outputPass: true } } }
    expect(validateSceneDocument(custom(four))).toEqual(custom(four))
    rejects(custom({ ...four, fx: { ...four.fx, passes: { ...four.fx.passes, toon: true } } }), 'sceneData.scene.fx', 'at most 4')
    rejects(custom({ ...raw(), fx: { passOrder: ['bloom', 'bloom'] } }), 'sceneData.scene.fx.passOrder[1]', 'Duplicate')
    rejects(custom({ ...raw(), fx: { passOrder: ['customPass'] } }), 'sceneData.scene.fx.passOrder[0]', 'Unsupported')
  })

  it('enforces audio mapping versions, targets, and resource bounds', () => {
    const mapping = { target: 'size', source: 'overall-hit', amount: 4, attack: 2, release: 5 }
    const config = { version: 1, sensitivity: 4, mappings: [mapping] }
    expect(validateSceneDocument(custom({ ...raw(), audioResponseConfig: config }))).toBeTruthy()
    for (const [field, value] of [['amount', 4.01], ['attack', 2.01], ['release', 5.01]] as const) {
      rejects(custom({ ...raw(), audioResponseConfig: { ...config, mappings: [{ ...mapping, [field]: value }] } }), `sceneData.scene.audioResponseConfig.mappings[0].${field}`)
    }
    rejects(custom({ ...raw(), audioResponseConfig: { ...config, version: 2 } }), 'sceneData.scene.audioResponseConfig.version')
    rejects(custom({ ...raw(), audioResponseConfig: { ...config, mappings: [mapping, { ...mapping, source: 'bass-hit' }] } }), 'sceneData.scene.audioResponseConfig.mappings[1]', 'Duplicate')
  })

  it('bounds depth, array lengths, object widths, total fields and nodes before schema traversal', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let i = 0; i < 16; i++) { const next = {}; cursor.child = next; cursor = next }
    expect(() => validateSceneDocument(deep)).toThrow('nesting')
    rejects({ items: Array(65).fill(0) }, 'sceneData.items', 'array items')
    rejects(Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, i])), 'sceneData', 'object fields')
    rejects({ items: Array.from({ length: 9 }, () => Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]))) }, 'sceneData', 'total object fields')
    rejects({ items: Array.from({ length: 64 }, () => Array(64).fill(0)) }, 'sceneData', 'JSON values')
    rejects({ ['é'.repeat(33)]: 1 }, 'sceneData', 'Field names')
  })

  it('does not invoke getters or toJSON while rejecting unsafe object shapes', () => {
    const hook = vi.fn(() => 'unexpected execution')
    const getter = Object.defineProperty(custom(), 'kind', { enumerable: true, get: hook })
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    const values = [getter, { ...custom(), toJSON: hook }, { ...custom(), hidden: () => 1 }, cycle,
      { items: new Array(1) }, { items: Object.assign([1], { extra: 2 }) }, Object.create({ kind: 'custom' }),
      JSON.parse('{"__proto__":{"polluted":true}}'), { [Symbol('hidden')]: 1 },
      Object.defineProperty(custom(), 'hidden', { value: 1 }), { value: Infinity }, { value: NaN }]
    for (const value of values) expect(() => validateSceneDocument(value)).toThrow(SceneValidationError)
    expect(hook).not.toHaveBeenCalled()
  })

  it('returns safe field paths even when unknown property names contain message syntax', () => {
    const document = { ...template, settings: { ['bad: message\n<script>']: 1 } }
    expect(() => validateSceneDocument(document)).toThrow(SceneValidationError)
    try { validateSceneDocument(document) } catch (error) {
      expect((error as SceneValidationError).details).toEqual({ sceneData: 'unknown field' })
    }
  })

  it('exports immutable policy and runtime ceilings without creating an execution permission', () => {
    expect(SCENE_RUNTIME_CEILINGS.raymarchIterations).toBe(200)
    expect(Object.isFrozen(SCENE_POLICY.scene.fields.visualizer.fields)).toBe(true)
    expect(Object.isFrozen(SCENE_LIMITS)).toBe(true)
  })
})

describe('bounded JSON imports and submission bodies', () => {
  it('imports raw and explicit custom documents exactly once', () => {
    for (const input of [raw(), custom()]) expect(parseSceneImport(JSON.stringify(input))).toEqual(custom())
    expect(parseSceneImport(JSON.stringify(template)).kind).toBe('template')
  })

  it.each([
    '{"visualizer":{"shader":"x","shader":"y"}}',
    '{"visualizer":{"shader":"x","sha\\u0064er":"y"}}',
    '{"schemaVersion":99,"schemaVersion":1,"kind":"custom","scene":{"visualizer":{"shader":"x"}}}',
  ])('rejects duplicate keys before JSON parsing can discard them', text => {
    expect(() => parseSceneImport(text)).toThrow('Duplicate object fields')
  })

  it.each(['', '{} trailing', '{"a":1,}', '{"a":[1,]}', '{"a":01}', '{"a":+1}', '{"a":NaN}', '{"a":"bad\nstring"}', '[]', 'null', '{"a":1e400}', '{"a":undefined}'])('rejects malformed JSON %s', text => {
    expect(() => parseSceneImport(text)).toThrow(SceneValidationError)
  })

  it('never interprets malformed document markers as legacy data', () => {
    for (const value of [{ ...raw(), kind: 'other' }, { ...custom(), schemaVersion: 2 }, { ...raw(), templateId: 'embedded-scene-0' }]) {
      expect(() => parseSceneImport(JSON.stringify(value))).toThrow(SceneValidationError)
    }
  })

  it('bounds input text before parsing, and never hides a request size rejection', () => {
    expect(() => parseSceneImport(' '.repeat(SCENE_LIMITS.requestBytes + 1))).toThrow('524288')
    expect(() => parseSceneImport('é'.repeat(SCENE_LIMITS.requestBytes / 2 + 1))).toThrow('524288')
    const body = { name: 'Scene', sceneData: custom() }
    expect(() => assertSceneRequestBudget(body)).not.toThrow()
    expect(() => assertSceneRequestBudget({ ...body, description: 'x'.repeat(SCENE_LIMITS.requestBytes) })).toThrow('524288')
  })
})
