import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderDriverTarget, type BuilderGroup, type BuilderMaterial, type BuilderOperation, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { createBuilderObject, createBuilderScene } from './builderEditor'
import { identityBuilderFrame } from './builderGroups'
import { createTemplateScene } from './templateEditor'
import { COMPLEX_RECIPE_REFERENCES, createComplexBuilderRecipe } from './builderComplexRecipes'

export const BUILDER_RECIPES = [
  { templateId: 'embedded-scene-0', label: 'Prism Core', description: 'Two prism frames and a reflective core with layered view motion, pointer response, and two animated joins.' },
  { templateId: 'embedded-scene-1', label: 'Steel Lattice', description: 'A folded lattice and three box frames with shared motion and an animated outer join.' },
  { templateId: 'embedded-scene-2', label: 'Aqua Static', description: 'Two cyan frames with layered noise expansion, a folded inner lattice, and a fractional outer lattice.' },
  { templateId: 'embedded-scene-3', label: 'Verdant Frames', description: 'Two green frames and a wide supporting lattice with shared motion and an animated join.' },
  { templateId: 'embedded-scene-4', label: 'Crimson Reactor', description: 'A noisy union of red frames and cylinders, a clean core sphere, and a supporting lattice.' },
  { templateId: 'embedded-scene-5', label: 'Alloy Capsule', description: 'A metallic cylinder and two spheres with shared rotation, pointer response, and view-dependent shaping.' },
  { templateId: 'embedded-scene-6', label: 'Redline Core', description: 'A red sphere, cylinder, dense inner lattice, and wide supporting lattice.' },
  { templateId: 'embedded-scene-7', label: 'Violet Matrix', description: 'Two dense violet lattices and two centered spheres with an animated inner join.' },
  { templateId: 'embedded-scene-8', label: 'Mint Halo', description: 'A mint ring, frame, two inner lattices, center sphere, and supporting lattice.' },
  { templateId: 'embedded-scene-9', label: 'Ember Grid', description: 'An orange frame and folded lattice surrounding a smoothly joined inner sphere.' },
  { templateId: 'embedded-scene-10', label: 'Emerald Ring', description: 'A green ring and frame over a wide supporting lattice.' },
  { templateId: 'embedded-scene-11', label: 'Spectrum Relay', description: 'A noise-expanded cylinder, ring, and lattice colored by the viewing direction.' },
  { templateId: 'embedded-scene-12', label: 'Chroma Storm', description: 'Ordered noise expansion across five shapes with shared view-driven motion and rainbow color.' },
  { templateId: 'embedded-scene-13', label: 'Rose Circuit', description: 'Two metallic rings and a cylinder with independent phased motion, rose colors, and scoped noise.' },
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

type DeformationReference = Pick<RecipeReference, 'sourceIterations' | 'sourceStepSize' | 'objects'> & {
  material: BuilderMaterial
  supportLast: boolean
}
const DEFORMATION_REFERENCES = {
  'embedded-scene-2': {
    material: { color: { x: .08256470259178794, y: .782309705948631, z: .763003005740327 },
      metalness: referenceSize * .5728721327171771, shininess: .36898649780731946 },
    sourceIterations: 133, sourceStepSize: .8632297724861512, supportLast: true,
    objects: [
      { name: 'Outer cyan frame', operation: frame(.8865473246350158) },
      { name: 'Inner cyan frame', operation: frame(.6350550547291461) },
      { name: 'Inner lattice', operation: lattice(3, .6596742230897178) },
      { name: 'Fractional supporting lattice', operation: supportLattice(1.99) },
    ],
  },
  'embedded-scene-4': {
    material: { color: { x: .8939736534961771, y: .15343539973164377, z: .2647498251648912 },
      metalness: referenceSize * .5135977939307566, shininess: .4793980848131761 },
    sourceIterations: 161, sourceStepSize: .7431197197400152, supportLast: true,
    objects: [
      { name: 'Crimson frame', operation: frame(.8161210436163664) },
      { name: 'Outer cylinder', operation: { type: 'cylinder', radius: referenceSize * .8534422954798347, height: referenceSize * .8534422954798347 } },
      { name: 'Inner cylinder', operation: { type: 'cylinder', radius: referenceSize * .7693094322944559, height: referenceSize * .7693094322944559 } },
      { name: 'Clean core sphere', operation: sphere(.886879464900987) },
      { name: 'Supporting lattice', operation: supportLattice(1) },
    ],
  },
  'embedded-scene-11': {
    material: { color: { x: 1, y: 1, z: 1 }, metalness: .5, shininess: .3 },
    sourceIterations: 96, sourceStepSize: .8497186712056144, supportLast: false,
    objects: [
      { name: 'Noisy cylinder', operation: { type: 'cylinder', radius: referenceSize * .6168195561594768, height: referenceSize * .6168195561594768 } },
      { name: 'Spectrum ring', operation: torus(.8334445133920002) },
      { name: 'Spectrum lattice', operation: lattice(3, .9954834969507702) },
    ],
  },
  'embedded-scene-12': {
    material: { color: { x: 1, y: 1, z: 1 }, metalness: .5, shininess: .3 },
    sourceIterations: 78, sourceStepSize: .7369359368566446, supportLast: false,
    objects: [
      { name: 'Noisy center sphere', operation: sphere(.6061774521306397) },
      { name: 'Chroma ring', operation: torus(.5957939662981329) },
      { name: 'Chroma cylinder', operation: { type: 'cylinder', radius: referenceSize * .7847176552581908, height: referenceSize * .7847176552581908 } },
      { name: 'Dense chroma lattice', operation: lattice(5, .6803317673052074) },
      { name: 'Outer chroma frame', operation: frame(.8080101969375488) },
    ],
  },
} as const satisfies Partial<Record<TemplateId, DeformationReference>>

/** Describe the shared conversion before replacing an authored document. */
export function builderRecipeReference(templateId: TemplateId) {
  const reference = templateId === 'embedded-scene-0' || templateId === 'embedded-scene-13' ? COMPLEX_RECIPE_REFERENCES[templateId]
    : Object.hasOwn(DEFORMATION_REFERENCES, templateId)
    ? DEFORMATION_REFERENCES[templateId as keyof typeof DEFORMATION_REFERENCES]
    : RECIPE_REFERENCES[templateId as keyof typeof RECIPE_REFERENCES]
  if (!reference) return null
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

function recipeObjects(objects: RecipeReference['objects'], prefix: string, material: BuilderMaterial, supportLast = true) {
  return objects.map(({ name, operation }, index) => ({
    ...createBuilderObject(operation.type), id: `${prefix}-object-${index + 1}`, name,
    operation: structuredClone(operation), material: structuredClone(material),
    drivers: geometryDrivers(operation, supportLast && index === objects.length - 1),
  }))
}

/** A fresh concrete document, never a template alias or embedded shader. */
export function createBuilderRecipe(templateId: TemplateId, settings?: BuilderSceneDocument['settings'], parameters?: BuilderSceneDocument['parameters']): BuilderSceneDocument {
  if (templateId === 'embedded-scene-0' || templateId === 'embedded-scene-13') {
    const parsed = parseSceneDocument(createComplexBuilderRecipe(templateId, settings, parameters))
    if (parsed.kind !== 'builder') throw new Error('Expected a Builder recipe.')
    return parsed
  }
  if (Object.hasOwn(DEFORMATION_REFERENCES, templateId)) {
    return createDeformationRecipe(templateId as keyof typeof DEFORMATION_REFERENCES, settings, parameters)
  }
  if (!Object.hasOwn(RECIPE_REFERENCES, templateId)) throw new Error('This template does not have an editable Builder version yet.')
  const reference = RECIPE_REFERENCES[templateId as keyof typeof RECIPE_REFERENCES]
  const scene = createBuilderScene(templateId)
  const template = createTemplateScene(templateId)
  const prefix = templateId.replace('embedded-scene-', 'recipe-')
  const material = { color: reference.color, metalness: referenceSize * reference.metalness, shininess: reference.shininess }
  const objects = recipeObjects(reference.objects, prefix, material)
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

/** Noise modifies a completed union; it never leaks into a later sibling. */
function noiseExpansion(frequency: number, strength: number, ancestor?: number) {
  const position: Expression = ancestor === undefined ? input('world-position')
    : { type: 'input', source: 'group-position', ancestor }
  return {
    modifiers: [{ type: 'expand' as const, amount: strength }],
    drivers: [driver('modifier.expand.amount', { type: 'noise', input: scaled(position, frequency) })],
  }
}

function createDeformationRecipe(templateId: keyof typeof DEFORMATION_REFERENCES,
  settings?: BuilderSceneDocument['settings'], parameters?: BuilderSceneDocument['parameters']): BuilderSceneDocument {
  const reference = DEFORMATION_REFERENCES[templateId]
  const scene = createBuilderScene(templateId), template = createTemplateScene(templateId)
  const prefix = templateId.replace('embedded-scene-', 'recipe-')
  const material: BuilderMaterial = structuredClone(reference.material)
  const objects = recipeObjects(reference.objects, prefix, material, reference.supportLast)
  const object = (index: number) => objects[index].id
  const id = (suffix: string) => `${prefix}-${suffix}`
  const group = (suffix: string, name: string, children: string[], extra: Partial<BuilderGroup> = {}): BuilderGroup => ({
    id: id(suffix), name, children, transform: identityBuilderFrame(), operation: { type: 'union' }, ...extra,
  })
  const rayColor = (['r', 'g', 'b'] as const).map((channel, index) =>
    driver(`material.color.${channel}`, component('view-ray', (['x', 'y', 'z'] as const)[index]), 'replace'))
  let groups: BuilderGroup[], root: string
  if (templateId === 'embedded-scene-2' || templateId === 'embedded-scene-4') {
    const aqua = templateId === 'embedded-scene-2'
    const speed = aqua ? .131579219319508 : .15934458017140202
    const ray = aqua ? [2.154824707715323, 2.583074645636565, 2.9303390219795165]
      : [2.4340193013105202, 1.7776157305492712, 1.7322517724210127]
    const blend = aqua ? .280208045235598 : .17222512677372692
    root = id('motion')
    groups = [
      group('motion', 'Shared motion and color', [id('view')], { material, drivers: [
        driver('rotation.x', add(clock(speed), scaled(component('scene-pointer', 'y'), Math.PI * 2.5)), 'add'),
        driver('rotation.y', add(add(clock(-speed), scaled(component('scene-pointer', 'x'), Math.PI * 2.5)), add(scenePointerDown(), constant(.1))), 'add'),
        driver('material.metalness', dimensionRatio(material.metalness)),
      ] }),
      group('view', 'View shaping and outer join', [id('body'), object(objects.length - 1)], {
        transform: { ...identityBuilderFrame(), rotationOrder: 'zyx' }, operation: { type: 'smooth-union', blend: blend / 2 },
        drivers: [
          driver('rotation.x', add(scaled(component('view-ray', 'y'), ray[0]), clock(speed)), 'add'),
          driver('rotation.y', add(scaled(component('view-ray', 'x'), -ray[1]), clock(-speed)), 'add'),
          driver('rotation.z', add(scaled(component('view-ray', 'z'), ray[2]), clock(speed)), 'add'),
          driver('blend', add({ type: 'sin', input: multiply(clock(speed), sceneSize()) }, constant(1))),
        ],
      }),
      group('body', 'Main shapes', [id('expanded-body'), object(aqua ? 2 : 3)]),
      group('expanded-body', aqua ? 'Expanded frame pair' : 'Expanded frame and cylinders',
        aqua ? [id('expanded-frame'), object(1)] : [object(0), object(1), object(2)],
        noiseExpansion(aqua ? .22270041645902117 : .1959164091445773, aqua ? .41792724482850996 : .09097642567410547, 3)),
      ...(aqua ? [group('expanded-frame', 'Fine noise on outer frame', [object(0)], noiseExpansion(1.768209282106819, .030656382800295368, 4))] : []),
    ]
  } else if (templateId === 'embedded-scene-11') {
    root = id('body')
    groups = [
      group('body', 'View color and shapes', [id('expanded-cylinder'), object(1), object(2)], { material, drivers: rayColor }),
      group('expanded-cylinder', 'Expanded cylinder', [object(0)], noiseExpansion(.7369379972723424, .2843224929727242)),
    ]
  } else {
    const speed = .9539348297232683
    root = id('view')
    groups = [
      group('view', 'View motion and color', [id('expanded-lattice'), object(4)], {
        material, transform: { ...identityBuilderFrame(), rotationOrder: 'zyx' }, drivers: [
          driver('rotation.x', add(scaled(component('view-ray', 'y'), 2.4510099887638064), clock(speed * 2.4510099887638064)), 'add'),
          driver('rotation.z', add(scaled(component('view-ray', 'z'), 1.329787985176121), clock(speed * 1.329787985176121)), 'add'),
          ...rayColor,
        ],
      }),
      group('expanded-lattice', 'Noise before outer frame', [id('expanded-core'), object(3)], noiseExpansion(1.6366720215270216, .40304648326346637, 1)),
      group('expanded-core', 'Noise before lattice', [id('expanded-sphere'), object(1), object(2)], noiseExpansion(.5620060333649501, .4766355635901381, 2)),
      group('expanded-sphere', 'Noise on center sphere', [object(0)], noiseExpansion(1.9603753411504794, .38739515373281597, 3)),
    ]
  }
  // Aqua/Chroma's first expand changes only the empty distance sentinel. The
  // final blend in Spectrum/Chroma has no following shape. Neither creates a
  // visible deformation or join, so neither is invented in the editable recipe.
  const parsed = parseSceneDocument({ ...scene, parameters: structuredClone(parameters ?? template.parameters),
    settings: structuredClone(settings ?? template.settings), objects,
    rendering: { maxIterations: reference.sourceIterations, stepSize: reference.sourceStepSize },
    composition: { version: 1, roots: [root], groups },
  })
  if (parsed.kind !== 'builder') throw new Error('Expected a Builder recipe.')
  return parsed
}
