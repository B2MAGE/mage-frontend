import { parseSceneDocument, type BuilderDriver, type BuilderDriverTarget, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { createBuilderObject, createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, type DriverPresetValues } from './builderDrivers'
import { identityBuilderFrame } from './builderGroups'

export const BUILDER_RECIPES = [{ templateId: 'embedded-scene-5' as const, label: 'Alloy Capsule',
  description: 'A metallic cylinder and two spheres with shared rotation, pointer response, and view-dependent shaping.' }] as const

/** Current reference: size .6, clock zero, centered/released pointer, and no audio. */
export const ALLOY_CAPSULE_REFERENCE_SIZE = .6

function influence(target: BuilderDriverTarget, values: Partial<DriverPresetValues>, mode: BuilderDriver['mode'] = 'add'): BuilderDriver {
  return { target, mode, expression: createDriverPresetExpression({ preset: 'follow', source: 'time', speed: .1, amount: 1,
    phase: 0, offset: 0, minimum: -10, maximum: 10, ...values }) }
}

/** A fresh concrete document, never a template alias or embedded shader. */
export function createBuilderRecipe(templateId: TemplateId, settings?: BuilderSceneDocument['settings']): BuilderSceneDocument {
  if (templateId !== 'embedded-scene-5') throw new Error('This template does not have an editable Builder version yet.')
  const scene = createBuilderScene(templateId)
  const cylinder = createBuilderObject('cylinder')
  cylinder.id = 'capsule-cylinder'; cylinder.name = 'Cylinder shell'
  cylinder.operation = { type: 'cylinder', radius: ALLOY_CAPSULE_REFERENCE_SIZE * .9446738625954518, height: ALLOY_CAPSULE_REFERENCE_SIZE * .9446738625954518 }
  const outer = createBuilderObject('sphere', [cylinder])
  outer.id = 'capsule-outer-sphere'; outer.name = 'Outer sphere'; outer.operation = { type: 'sphere', radius: ALLOY_CAPSULE_REFERENCE_SIZE * .7023682612074287 }
  const inner = createBuilderObject('sphere', [cylinder, outer])
  inner.id = 'capsule-inner-sphere'; inner.name = 'Inner sphere'; inner.operation = { type: 'sphere', radius: ALLOY_CAPSULE_REFERENCE_SIZE / 3 }
  for (const object of [cylinder, outer, inner]) object.material = { color: '#3d4437', metalness: ALLOY_CAPSULE_REFERENCE_SIZE * .6304962928840792, shininess: .6210181878056416 }

  const document = {
    ...scene, ...(settings ? { settings: structuredClone(settings) } : {}),
    objects: [cylinder, outer, inner],
    composition: { version: 1, roots: ['capsule-motion'], groups: [
      { id: 'capsule-motion', name: 'Shared motion', children: ['capsule-view'], transform: identityBuilderFrame(), operation: { type: 'union' },
        drivers: [
          influence('rotation.x', { preset: 'spin', speed: .1 }),
          influence('rotation.y', { preset: 'spin', speed: -.1, phase: .1 }),
          influence('rotation.x', { source: 'pointer-y', amount: Math.PI * 2.5 }),
          influence('rotation.y', { source: 'pointer-x', amount: Math.PI * 2.5 }),
          influence('scale', { source: 'overall-level', amount: .35, offset: 1, minimum: .7, maximum: 1.35 }, 'multiply'),
          influence('rotation.y', { source: 'pointer-down', amount: .15 }),
        ] },
      { id: 'capsule-view', name: 'View shaping', children: ['capsule-body', inner.id], transform: identityBuilderFrame(),
        operation: { type: 'smooth-union', blend: .05 },
        drivers: [
          influence('rotation.x', { source: 'view-ray.y', amount: 1.959900687 }),
          influence('rotation.y', { source: 'view-ray.x', amount: 1.959900687 }),
          influence('rotation.z', { source: 'view-ray.z', amount: 1.959900687 }),
          influence('rotation.x', { preset: 'spin', speed: .1 }),
          influence('rotation.y', { preset: 'spin', speed: .1 }),
          influence('rotation.z', { preset: 'spin', speed: .1 }),
          influence('blend', { preset: 'pulse', source: 'time', speed: .1 * ALLOY_CAPSULE_REFERENCE_SIZE, phase: -Math.PI / 2, amount: .11435451161014794, minimum: 0, maximum: .15 }, 'replace'),
        ] },
      { id: 'capsule-body', name: 'Cylinder and sphere', children: [cylinder.id, outer.id], transform: identityBuilderFrame(), operation: { type: 'union' } },
    ] },
  }
  const parsed = parseSceneDocument(document)
  if (parsed.kind !== 'builder') throw new Error('Expected a Builder recipe.')
  return parsed
}
