import { parseSceneDocument, type BuilderDriver, type BuilderDriverTarget, type BuilderOperation, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { createBuilderObject, createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, type DriverPresetValues } from './builderDrivers'
import { identityBuilderFrame } from './builderGroups'

export const BUILDER_RECIPES = [
  { templateId: 'embedded-scene-1', label: 'Steel Lattice', description: 'A folded lattice and three box frames with shared motion and an animated outer join.' },
  { templateId: 'embedded-scene-3', label: 'Verdant Frames', description: 'Two green frames and a wide supporting lattice with shared motion and an animated join.' },
  { templateId: 'embedded-scene-5', label: 'Alloy Capsule', description: 'A metallic cylinder and two spheres with shared rotation, pointer response, and view-dependent shaping.' },
  { templateId: 'embedded-scene-6', label: 'Redline Core', description: 'A red sphere, cylinder, dense inner lattice, and wide supporting lattice.' },
  { templateId: 'embedded-scene-7', label: 'Violet Matrix', description: 'Two dense violet lattices and two centered spheres with an animated inner join.' },
  { templateId: 'embedded-scene-8', label: 'Mint Halo', description: 'A mint ring, frame, two inner lattices, center sphere, and supporting lattice.' },
  { templateId: 'embedded-scene-9', label: 'Ember Grid', description: 'An orange frame and folded lattice surrounding a smoothly joined inner sphere.' },
  { templateId: 'embedded-scene-10', label: 'Emerald Ring', description: 'A green ring and frame over a wide supporting lattice.' },
] as const satisfies readonly { templateId: TemplateId; label: string; description: string }[]

/** Current reference: size .6, clock zero, centered/released pointer, and no audio. */
export const ALLOY_CAPSULE_REFERENCE_SIZE = .6
export const FRAME_LATTICE_REFERENCE_SIZE = .6

function influence(target: BuilderDriverTarget, values: Partial<DriverPresetValues>, mode: BuilderDriver['mode'] = 'add'): BuilderDriver {
  return { target, mode, expression: createDriverPresetExpression({ preset: 'follow', source: 'time', speed: .1, amount: 1,
    phase: 0, offset: 0, minimum: -10, maximum: 10, ...values }) }
}

/** A fresh concrete document, never a template alias or embedded shader. */
export function createBuilderRecipe(templateId: TemplateId, settings?: BuilderSceneDocument['settings']): BuilderSceneDocument {
  if (templateId !== 'embedded-scene-5') return createFrameLatticeRecipe(templateId, settings)
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

type FrameLatticeReference = {
  color: string
  metalness: number
  shininess: number
  rayRotation: number
  blend: number
  sourceIterations: number
  sourceStepSize: number
  objects: readonly { name: string; operation: BuilderOperation }[]
}

const referenceSize = FRAME_LATTICE_REFERENCE_SIZE
const frame = (coefficient: number, thicknessCoefficient = coefficient): BuilderOperation => ({
  type: 'box-frame', width: referenceSize * coefficient, height: referenceSize * coefficient,
  depth: referenceSize * coefficient, thickness: referenceSize * thicknessCoefficient,
})
const lattice = (iterations: number, coefficient: number): BuilderOperation => {
  const spacing = referenceSize * coefficient
  // Shader Park's third grid argument is a ratio. Our editable field is the
  // actual rod radius, so the original roundness must also multiply spacing.
  return { type: 'lattice', iterations, spacing, thickness: .01 * spacing * spacing }
}
const supportLattice = (iterations: number): BuilderOperation => ({ type: 'lattice', iterations,
  spacing: referenceSize * 4, thickness: Math.max(.001, referenceSize * .003) * referenceSize * 4 })
const sphere = (coefficient: number): BuilderOperation => ({ type: 'sphere', radius: referenceSize * coefficient })
const torus = (coefficient: number): BuilderOperation => ({ type: 'torus', radius: referenceSize * coefficient, tube: referenceSize * coefficient })

// These coefficients are the executable version-one definitions, not their
// marketing descriptions. In particular, Mint Halo contains no noise call.
const FRAME_LATTICE_REFERENCES = {
  'embedded-scene-1': {
    color: '#6e7e7b', metalness: .5870582642599769, shininess: .6708057727257557,
    rayRotation: 1.2506225601940093, blend: .22812291319767167,
    sourceIterations: 101, sourceStepSize: .7260629659452175,
    objects: [
      { name: 'Steel lattice', operation: lattice(3, .7174867540818692) },
      { name: 'Inner frame', operation: frame(.6287507765216367) },
      { name: 'Outer frame', operation: frame(.6816361304019778) },
      { name: 'Fine frame', operation: frame(.7, .05) },
    ],
  },
  'embedded-scene-3': {
    color: '#267910', metalness: .6434036988763767, shininess: .34486068234140727,
    rayRotation: 2.9789122078821793, blend: .25980941491680876,
    sourceIterations: 71, sourceStepSize: .4414923770441956,
    objects: [
      { name: 'Inner green frame', operation: frame(.8239408771788657) },
      { name: 'Outer green frame', operation: frame(.9606847874663808) },
      { name: 'Supporting lattice', operation: supportLattice(2) },
    ],
  },
  'embedded-scene-6': {
    color: '#f31b00', metalness: .7125574975041655, shininess: .5774589834819871,
    rayRotation: 2.1969051528600634, blend: .22861033952631743,
    sourceIterations: 198, sourceStepSize: .8838993805155669,
    objects: [
      { name: 'Core sphere', operation: sphere(.9935175302558173) },
      { name: 'Core cylinder', operation: { type: 'cylinder', radius: referenceSize * .9289837692896183, height: referenceSize * .9289837692896183 } },
      { name: 'Dense inner lattice', operation: lattice(5, .5167759726831176) },
      { name: 'Supporting lattice', operation: supportLattice(2) },
    ],
  },
  'embedded-scene-7': {
    color: '#1d0277', metalness: .5711799571404537, shininess: .5590513531439385,
    rayRotation: 2.0857194147559914, blend: .1017060511129565,
    sourceIterations: 193, sourceStepSize: .7999169963821687,
    objects: [
      { name: 'Dense outer lattice', operation: lattice(5, .7173114499365616) },
      { name: 'Inner lattice', operation: lattice(4, .6514999435141519) },
      { name: 'Outer violet sphere', operation: sphere(.7684034276974527) },
      { name: 'Inner violet sphere', operation: sphere(1 / 3) },
    ],
  },
  'embedded-scene-8': {
    color: '#67c673', metalness: .6607251320316083, shininess: .6646852498948923,
    rayRotation: 1.4049960809220177, blend: .19517422836065718,
    sourceIterations: 186, sourceStepSize: .8615043142034936,
    objects: [
      { name: 'Mint ring', operation: torus(.7885283144721178) },
      { name: 'Inner lattice', operation: lattice(3, .5103440758834754) },
      { name: 'Mint frame', operation: frame(.57344769639438) },
      { name: 'Outer lattice', operation: lattice(3, .5749414312428847) },
      { name: 'Center sphere', operation: sphere(.6151950610078535) },
      { name: 'Supporting lattice', operation: supportLattice(1) },
    ],
  },
  'embedded-scene-9': {
    color: '#ff4d00', metalness: .4757753414424941, shininess: .4905478148343774,
    rayRotation: 2.7452866417099218, blend: .10155951925016898,
    sourceIterations: 56, sourceStepSize: .7549446257595138,
    objects: [
      { name: 'Ember frame', operation: frame(.7439170606081622) },
      { name: 'Ember lattice', operation: lattice(3, .508466039994321) },
      { name: 'Inner sphere', operation: sphere(1 / 3) },
    ],
  },
  'embedded-scene-10': {
    color: '#32e93f', metalness: .31594207653292694, shininess: .3832572948846391,
    rayRotation: 1.9938824658616179, blend: .11214341939632295,
    sourceIterations: 151, sourceStepSize: .26597607104610804,
    objects: [
      { name: 'Emerald ring', operation: torus(.8810248079142805) },
      { name: 'Emerald frame', operation: frame(.8855044665503) },
      { name: 'Supporting lattice', operation: supportLattice(1) },
    ],
  },
} as const satisfies Partial<Record<TemplateId, FrameLatticeReference>>

/** Inform authors about deliberate conversion differences before replacing their document. */
export function builderRecipeReference(templateId: TemplateId) {
  if (!Object.hasOwn(FRAME_LATTICE_REFERENCES, templateId)) return null
  const reference = FRAME_LATTICE_REFERENCES[templateId as keyof typeof FRAME_LATTICE_REFERENCES]
  return {
    size: referenceSize, sourceIterations: reference.sourceIterations, sourceStepSize: reference.sourceStepSize,
    note: 'Keeps the original shapes, proportions, and rotation order. Music response and fine lattice detail may look different in Builder.',
  }
}

function createFrameLatticeRecipe(templateId: TemplateId, settings?: BuilderSceneDocument['settings']): BuilderSceneDocument {
  if (!Object.hasOwn(FRAME_LATTICE_REFERENCES, templateId)) throw new Error('This template does not have an editable Builder version yet.')
  const reference = FRAME_LATTICE_REFERENCES[templateId as keyof typeof FRAME_LATTICE_REFERENCES]
  const scene = createBuilderScene(templateId)
  const prefix = templateId.replace('embedded-scene-', 'recipe-')
  const objects = reference.objects.map(({ name, operation }, index) => ({
    ...createBuilderObject(operation.type), id: `${prefix}-object-${index + 1}`, name,
    operation: structuredClone(operation),
    material: { color: reference.color, metalness: referenceSize * reference.metalness, shininess: reference.shininess },
  }))
  const document = {
    ...scene, ...(settings ? { settings: structuredClone(settings) } : {}), objects,
    composition: { version: 1, roots: [`${prefix}-motion`], groups: [
      { id: `${prefix}-motion`, name: 'Shared motion', children: [`${prefix}-view`], transform: identityBuilderFrame(), operation: { type: 'union' },
        drivers: [
          influence('rotation.x', { preset: 'spin', speed: .1 }),
          influence('rotation.y', { preset: 'spin', speed: -.1, phase: .1 }),
          influence('rotation.x', { source: 'pointer-y', amount: Math.PI * 2.5 }),
          influence('rotation.y', { source: 'pointer-x', amount: Math.PI * 2.5 }),
          influence('scale', { source: 'overall-level', amount: .35, offset: 1, minimum: .7, maximum: 1.35 }, 'multiply'),
          influence('rotation.y', { source: 'pointer-down', amount: 1 }),
        ] },
      { id: `${prefix}-view`, name: 'View shaping and join', children: [`${prefix}-body`, objects.at(-1)!.id],
        transform: { ...identityBuilderFrame(), rotationOrder: 'zyx' }, operation: { type: 'smooth-union', blend: reference.blend / 2 },
        drivers: [
          influence('rotation.x', { source: 'view-ray.y', amount: reference.rayRotation }),
          influence('rotation.y', { source: 'view-ray.x', amount: -reference.rayRotation }),
          influence('rotation.z', { source: 'view-ray.z', amount: reference.rayRotation }),
          influence('rotation.x', { preset: 'spin', speed: .1 }),
          influence('rotation.y', { preset: 'spin', speed: -.1 }),
          influence('rotation.z', { preset: 'spin', speed: .1 }),
          influence('blend', { preset: 'pulse', source: 'time', speed: .1 * referenceSize, phase: -Math.PI / 2,
            amount: reference.blend, minimum: 0, maximum: reference.blend }, 'replace'),
        ] },
      { id: `${prefix}-body`, name: 'Main shapes', children: objects.slice(0, -1).map(object => object.id),
        transform: identityBuilderFrame(), operation: { type: 'union' } },
    ] },
  }
  const parsed = parseSceneDocument(document)
  if (parsed.kind !== 'builder') throw new Error('Expected a Builder recipe.')
  return parsed
}
