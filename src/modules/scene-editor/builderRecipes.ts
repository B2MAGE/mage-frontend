import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderDriverTarget, type BuilderOperation, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { createBuilderObject, createBuilderScene } from './builderEditor'
import { identityBuilderFrame } from './builderGroups'
import { createTemplateScene } from './templateEditor'

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

/** Visible editing baseline; native influences retain the original live response. */
export const BUILDER_RECIPE_REFERENCE_SIZE = .6

type RecipeReference = {
  color: string
  metalness: number
  shininess: number
  rayRotation: number
  blend: number
  sourceIterations: number
  sourceStepSize: number
  objects: readonly { name: string; operation: BuilderOperation }[]
}

const referenceSize = BUILDER_RECIPE_REFERENCE_SIZE
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
const RECIPE_REFERENCES = {
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
  'embedded-scene-5': {
    color: '#3d4437', metalness: .6304962928840792, shininess: .6210181878056416,
    rayRotation: 1.9599006869721014, blend: .11435451161014794,
    sourceIterations: 56, sourceStepSize: .7,
    objects: [
      { name: 'Cylinder shell', operation: { type: 'cylinder', radius: referenceSize * .9446738625954518, height: referenceSize * .9446738625954518 } },
      { name: 'Outer sphere', operation: sphere(.7023682612074287) },
      { name: 'Inner sphere', operation: sphere(1 / 3) },
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
} as const satisfies Partial<Record<TemplateId, RecipeReference>>

/** Describe the shared conversion before replacing an authored document. */
export function builderRecipeReference(templateId: TemplateId) {
  if (!Object.hasOwn(RECIPE_REFERENCES, templateId)) return null
  const reference = RECIPE_REFERENCES[templateId as keyof typeof RECIPE_REFERENCES]
  return {
    size: referenceSize, sourceIterations: reference.sourceIterations, sourceStepSize: reference.sourceStepSize,
    note: 'Keeps the original shapes, scene response, rotation order, and rendering detail as editable objects and influences.',
  }
}

type Expression = BuilderDriverExpression
const constant = (value: number): Expression => ({ type: 'constant', value })
const input = (source: Extract<Expression, { type: 'input' }>['source']): Expression => ({ type: 'input', source })
const add = (left: Expression, right: Expression): Expression => ({ type: 'add', left, right })
const multiply = (left: Expression, right: Expression): Expression => ({ type: 'multiply', left, right })
const component = (source: 'scene-pointer' | 'view-ray', axis: 'x' | 'y' | 'z'): Expression => ({ type: 'component', input: input(source), axis })
const scaled = (expression: Expression, factor: number) => multiply(expression, constant(factor))
const sceneSize = () => input('scene-size')
const scenePointerDown = () => input('scene-pointer-down')
const clock = (speed = .1) => scaled(input('time'), speed)
const driver = (target: BuilderDriverTarget, expression: Expression, mode: BuilderDriver['mode'] = 'multiply'): BuilderDriver => ({ target, mode, expression })

/** Ratios preserve the original formula while leaving the visible base field editable. */
function dimensionRatio(baseline: number, pointerCoefficient = 0): Expression {
  const size = scaled(sceneSize(), 1 / referenceSize)
  return pointerCoefficient ? add(size, scaled(scenePointerDown(), -pointerCoefficient / baseline)) : size
}

function geometryDrivers(operation: BuilderOperation, final: boolean): BuilderDriver[] {
  switch (operation.type) {
    case 'box-frame': return [
      ...(['width', 'height', 'depth'] as const).map(axis => driver(`operation.${axis}`, dimensionRatio(operation[axis], final ? 0 : .05))),
      driver('operation.thickness', dimensionRatio(operation.thickness, final ? 0 : .005)),
    ]
    case 'sphere': return [driver('operation.radius', dimensionRatio(operation.radius, final ? 0 : .025))]
    case 'cylinder': return [driver('operation.radius', dimensionRatio(operation.radius, .0125)),
      driver('operation.height', dimensionRatio(operation.height, .05))]
    case 'torus': return [driver('operation.radius', dimensionRatio(operation.radius, .05)),
      driver('operation.tube', dimensionRatio(operation.tube, .0125))]
    case 'lattice': {
      const spacingRatio = dimensionRatio(operation.spacing, final ? 0 : .05 / 3)
      const roundness = final
        ? { type: 'clamp' as const, input: scaled(sceneSize(), .003), min: .001, max: 1000 }
        : add(scaled(sceneSize(), .01 * operation.spacing / referenceSize), scaled(scenePointerDown(), -.05))
      // Original grid radius is its roundness ratio multiplied by cell size.
      // Keep both authored Cell size and Rod thickness independently editable.
      const roundnessAtReference = operation.thickness / operation.spacing
      const thicknessRatio = multiply(spacingRatio, scaled(roundness, 1 / roundnessAtReference))
      return [driver('operation.spacing', spacingRatio), driver('operation.thickness', thicknessRatio)]
    }
    default: throw new Error('Unsupported editable recipe operation.')
  }
}

/** A fresh concrete document, never a template alias or embedded shader. */
export function createBuilderRecipe(templateId: TemplateId, settings?: BuilderSceneDocument['settings'], parameters?: BuilderSceneDocument['parameters']): BuilderSceneDocument {
  if (!Object.hasOwn(RECIPE_REFERENCES, templateId)) throw new Error('This template does not have an editable Builder version yet.')
  const reference = RECIPE_REFERENCES[templateId as keyof typeof RECIPE_REFERENCES]
  const scene = createBuilderScene(templateId)
  const template = createTemplateScene(templateId)
  const prefix = templateId.replace('embedded-scene-', 'recipe-')
  const material = { color: reference.color, metalness: referenceSize * reference.metalness, shininess: reference.shininess }
  const objects = reference.objects.map(({ name, operation }, index) => ({
    ...createBuilderObject(operation.type), id: `${prefix}-object-${index + 1}`, name,
    operation: structuredClone(operation), material: { ...material },
    drivers: geometryDrivers(operation, index === reference.objects.length - 1),
  }))
  const document = {
    ...scene, parameters: structuredClone(parameters ?? template.parameters),
    settings: structuredClone(settings ?? template.settings), objects,
    rendering: { maxIterations: reference.sourceIterations, stepSize: reference.sourceStepSize },
    composition: { version: 1, roots: [`${prefix}-motion`], groups: [
      { id: `${prefix}-motion`, name: 'Shared motion', children: [`${prefix}-view`], transform: identityBuilderFrame(), operation: { type: 'union' },
        material,
        drivers: [
          driver('rotation.x', add(clock(), scaled(component('scene-pointer', 'y'), Math.PI * 2.5)), 'add'),
          driver('rotation.y', add(add(clock(-.1), scaled(component('scene-pointer', 'x'), Math.PI * 2.5)), add(scenePointerDown(), constant(.1))), 'add'),
          driver('material.metalness', dimensionRatio(material.metalness)),
        ] },
      { id: `${prefix}-view`, name: 'View shaping and join', children: [`${prefix}-body`, objects.at(-1)!.id],
        transform: { ...identityBuilderFrame(), rotationOrder: 'zyx' }, operation: { type: 'smooth-union', blend: reference.blend / 2 },
        drivers: [
          driver('rotation.x', add(scaled(component('view-ray', 'y'), reference.rayRotation), clock()), 'add'),
          driver('rotation.y', add(scaled(component('view-ray', 'x'), -reference.rayRotation), clock(-.1)), 'add'),
          driver('rotation.z', add(scaled(component('view-ray', 'z'), reference.rayRotation), clock()), 'add'),
          driver('blend', add({ type: 'sin', input: multiply(clock(), sceneSize()) }, constant(1))),
        ] },
      { id: `${prefix}-body`, name: 'Main shapes', children: objects.slice(0, -1).map(object => object.id),
        transform: identityBuilderFrame(), operation: { type: 'union' } },
    ] },
  }
  const parsed = parseSceneDocument(document)
  if (parsed.kind !== 'builder') throw new Error('Expected a Builder recipe.')
  return parsed
}
