/// <reference types="node" />
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import catalogManifest from '../../../../contracts/scenes/template-catalog.v1.json'
import { getTemplateDefinition, listSceneTemplates } from './templateRegistry'

describe('versioned template registry', () => {
  it('includes all 16 original presets as immutable version 1 definitions', () => {
    const catalog = listSceneTemplates()
    const originalIds = [
      ...Array.from({ length: 14 }, (_, index) => `embedded-scene-${index}`),
      'reaction-rings-v1',
      'reaction-lantern-v1',
    ]

    expect(catalog.map(({ templateId }) => templateId)).toEqual(originalIds)
    expect(Object.isFrozen(catalog)).toBe(true)
    expect(new Set(catalog.map(({ templateId, templateVersion }) => `${templateId}:${templateVersion}`)).size).toBe(16)

    for (const template of catalog) {
      expect(Object.isFrozen(template)).toBe(true)
      expect(template.templateVersion).toBe(1)
      const definition = getTemplateDefinition(template.templateId, template.templateVersion)
      expect(Object.isFrozen(definition)).toBe(true)
      expect(definition?.shader.length).toBeGreaterThan(0)
    }
  })

  it('exposes only code-free picker metadata', () => {
    for (const template of listSceneTemplates()) {
      expect(Object.keys(template).sort()).toEqual(['description', 'label', 'templateId', 'templateVersion'])
    }
  })

  it('matches the shared catalog and preserves the original source fingerprints', () => {
    // These hashes lock the shipped source independently of the live editor presets.
    // Add another version for changed code; do not update a published version's hash.
    expect(catalogManifest.catalogVersion).toBe(1)
    expect(catalogManifest.templates).toHaveLength(16)

    for (const { sourceSha256, ...metadata } of catalogManifest.templates) {
      const definition = getTemplateDefinition(metadata.templateId, metadata.templateVersion)
      expect(definition).toBeDefined()
      expect(listSceneTemplates()).toContainEqual(metadata)
      expect(createHash('sha256').update(definition!.shader).digest('hex')).toBe(sourceSha256)
    }
  })

  it.each([
    ['embedded-scene-0', 0],
    ['embedded-scene-0', 2],
    ['embedded-scene-0', Number.NaN],
    ['embedded-scene-0', Number.POSITIVE_INFINITY],
    ['unknown-template', 1],
    ['__proto__', 1],
    ['constructor', 1],
    ['toString', 1],
  ])('does not resolve unsupported template %s version %s', (templateId, version) => {
    expect(getTemplateDefinition(templateId, version)).toBeUndefined()
  })
})
