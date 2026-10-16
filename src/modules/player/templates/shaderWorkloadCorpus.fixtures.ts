import catalog from '../../../../contracts/scenes/builder-catalog.v1.fixtures.json'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'
import { getTemplateDefinition, listSceneTemplates } from './templateRegistry'

export const SHADER_WORKLOAD_CORPUS_VERSION = 1

function builder(objects: unknown[], extra: Record<string, unknown> = {}) {
  return parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1, objects,
    rendering: { maxIterations: 200, stepSize: .005 }, ...extra }) as BuilderSceneDocument
}

// Valid designs at individual existing Builder ceilings. They deliberately do
// not imply that all independent ceilings may be combined in a single scene.
function boundaryDesigns(): { id: string; document: BuilderSceneDocument }[] {
  const shape = (index: number) => ({ id: `object-${index}`, operation: { type: 'sphere', radius: .5 } })
  const noiseDesign = (objects: number, drivers: number, depth: number) => {
    let expression: BuilderDriverExpression = { type: 'noise', input: { type: 'input', source: 'local-position' } }
    for (let level = 1; level < depth; level++) expression = { type: 'noise', input: { type: 'multiply',
      left: { type: 'input', source: 'local-position' }, right: expression } }
    return builder(Array.from({ length: objects }, (_, index) => ({ ...shape(index),
      modifiers: [{ type: 'expand', amount: .1 }], drivers: Array.from({ length: drivers }, () => ({
        target: 'modifier.expand.amount', mode: 'add', expression,
      })),
    })))
  }
  return [
    { id: 'empty', document: builder([]) },
    { id: 'sixteen-objects-sixty-four-bindings', document: builder(Array.from({ length: 16 }, (_, i) => ({
      ...shape(i), bindings: [
        { target: 'position.x', source: 'bass-level' }, { target: 'position.y', source: 'mid-hit' },
        { target: 'position.z', source: 'pointer-x' }, { target: 'material.metalness', source: 'pointer-down' },
      ],
    }))) },
    { id: 'sixteen-arranged-frames', document: builder([{ id: 'frame', operation: { type: 'box-frame' },
      arrangements: [{ type: 'linear', axis: 'x', count: 4, spacing: 1 },
        { type: 'radial', axis: 'y', count: 4, radius: 2 }],
    }]) },
    { id: 'ten-five-level-lattices', document: builder(Array.from({ length: 10 }, (_, i) => ({
      ...shape(i), operation: { type: 'lattice', iterations: 5, spacing: 1, thickness: .05 },
    }))) },
    { id: 'six-deep-eight-groups', document: builder([shape(0), shape(1), shape(2)], {
      composition: { version: 1, roots: ['group-0', 'group-6', 'group-7'], groups: [
        ...Array.from({ length: 6 }, (_, i) => ({ id: `group-${i}`, children: [i === 5 ? 'object-0' : `group-${i + 1}`],
          operation: { type: 'smooth-union', blend: .1 }, transform: { scale: 1.1 } })),
        { id: 'group-6', children: ['object-1'] }, { id: 'group-7', children: ['object-2'] },
      ] },
    }) },
    { id: 'sixteen-spatial-noise-drivers', document: builder(Array.from({ length: 16 }, (_, i) => ({
      ...shape(i), modifiers: [{ type: 'expand', amount: .1 }],
      drivers: [{ target: 'modifier.expand.amount', mode: 'multiply',
        expression: { type: 'noise', input: { type: 'input', source: 'local-position' } } }],
    }))) },
    { id: 'eight-objects-three-triple-noise-drivers', document: noiseDesign(8, 3, 3) },
    { id: 'sixteen-objects-four-layer-noise', document: noiseDesign(16, 1, 4) },
  ]
}

export function shaderWorkloadCorpus() {
  const entries: { id: string; label: string; source: string }[] = []
  for (const template of listSceneTemplates()) {
    const original = getTemplateDefinition(template.templateId, template.templateVersion)!
    entries.push({ id: `${template.templateId}/original`, label: template.label, source: original.shader })
    const fixture = catalog.recipes.find(recipe => recipe.templateId === template.templateId)!
    const document = parseSceneDocument(fixture.document) as BuilderSceneDocument
    for (const [profile, scene] of [
      ['authored', document],
      ['max-iterations', { ...document, rendering: { maxIterations: 200, stepSize: .005 } }],
    ] as const) {
      for (const [mode, compile] of [['saved', compileBuilderDocument], ['preview', compileBuilderPreviewDocument]] as const) {
        entries.push({ id: `${template.templateId}/${profile}/${mode}`, label: template.label, source: compile(scene).shader })
      }
    }
  }
  for (const { id, document } of boundaryDesigns()) {
    for (const [mode, compile] of [['saved', compileBuilderDocument], ['preview', compileBuilderPreviewDocument]] as const) {
      entries.push({ id: `builder-boundary/${id}/${mode}`, label: id, source: compile(document).shader })
    }
  }
  return entries
}
