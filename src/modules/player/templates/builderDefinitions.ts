import schema from '../../../../contracts/scenes/scene-v1.schema.json'
import renderingPolicy from '../../../../contracts/scenes/builder-rendering.v1.json'
import type { BuilderArrangement, BuilderBinding, BuilderModifier, BuilderMotion, BuilderOperation } from './sceneContract'

export type BuilderShape = BuilderOperation['type']
export type BuilderDimension = 'width' | 'height' | 'depth' | 'radius' | 'tube' | 'iterations' | 'spacing' | 'thickness'
type NumberRule = Readonly<{ minimum: number; maximum: number; default: number }>
type Branch = { properties: Record<string, { const?: string; default?: unknown } | undefined> }

const object = schema.$defs.builder.properties.objects.items.properties
const group = schema.$defs.builder.properties.composition.properties.groups.items.properties

// These are trusted, checked-in contract branches, not author-supplied handlers.
function branch(rules: readonly Branch[], type: string) {
  const rule = rules.find(candidate => candidate.properties.type?.const === type)
  if (!rule) throw new Error(`Missing Builder contract definition: ${type}`)
  return rule.properties
}

function numericField(rules: readonly Branch[], type: string, key: string): NumberRule {
  return branch(rules, type)[key] as NumberRule
}

type OperationPresentation<T extends BuilderShape> = {
  label: string
  glyph: string
  fields: readonly {
    key: Exclude<keyof Extract<BuilderOperation, { type: T }>, 'type'>
    title: string
    summaryLabel: string
    compactLabel?: string
    compactStyle?: 'dimension' | 'suffix'
    description: string
    animatable?: boolean
  }[]
}

/** Presentation facts live here; numeric bounds/defaults come from the shared API schema. */
export const BUILDER_OPERATIONS = {
  sphere: { label: 'Sphere', glyph: '○', fields: [
    { key: 'radius', title: 'Radius', summaryLabel: 'Radius', description: 'Set the distance from the center to the surface.' },
  ] },
  box: { label: 'Box', glyph: '□', fields: [
    { key: 'width', title: 'Width', summaryLabel: 'Width', compactStyle: 'dimension', description: 'Set the shape from left to right.' },
    { key: 'height', title: 'Height', summaryLabel: 'Height', compactStyle: 'dimension', description: 'Set the shape from bottom to top.' },
    { key: 'depth', title: 'Depth', summaryLabel: 'Depth', compactStyle: 'dimension', description: 'Set the shape from front to back.' },
  ] },
  torus: { label: 'Torus', glyph: '◎', fields: [
    { key: 'radius', title: 'Radius', summaryLabel: 'Radius', description: 'Set the distance from the center to the ring.' },
    { key: 'tube', title: 'Tube thickness', summaryLabel: 'Tube', description: 'Set the thickness of the ring.' },
  ] },
  cylinder: { label: 'Cylinder', glyph: '▯', fields: [
    { key: 'radius', title: 'Radius', summaryLabel: 'Radius', description: 'Set the distance from the center to the side.' },
    { key: 'height', title: 'Height', summaryLabel: 'Height', description: 'Set the shape from bottom to top.' },
  ] },
  'box-frame': { label: 'Box frame', glyph: '◇', fields: [
    { key: 'width', title: 'Width', summaryLabel: 'Width', compactStyle: 'dimension', description: 'Set the frame from left to right.' },
    { key: 'height', title: 'Height', summaryLabel: 'Height', compactStyle: 'dimension', description: 'Set the frame from bottom to top.' },
    { key: 'depth', title: 'Depth', summaryLabel: 'Depth', compactStyle: 'dimension', description: 'Set the frame from front to back.' },
    { key: 'thickness', title: 'Frame thickness', summaryLabel: 'Thickness', compactLabel: 'Edge', description: 'Thicken the edges inward. Thick edges can fill the frame.' },
  ] },
  lattice: { label: 'Lattice', glyph: '▦', fields: [
    { key: 'iterations', title: 'Repetition levels', summaryLabel: 'Levels', compactLabel: 'repetitions', compactStyle: 'suffix', description: 'Each full level doubles the pattern along all three axes. Fractional levels adjust its spacing.', animatable: false },
    { key: 'spacing', title: 'Cell size', summaryLabel: 'Cell size', compactLabel: 'Spacing', description: 'Set the distance from a cell center to its edge.' },
    { key: 'thickness', title: 'Rod thickness', summaryLabel: 'Thickness', compactLabel: 'Rod', description: 'Set the radius of the rods that form the lattice.' },
  ] },
} as const satisfies { [T in BuilderShape]: OperationPresentation<T> }

export const BUILDER_SHAPES = (Object.keys(BUILDER_OPERATIONS) as BuilderShape[])
  .map(value => ({ label: BUILDER_OPERATIONS[value].label, value }))

export function builderOperationFields(operation: BuilderOperation) {
  return BUILDER_OPERATIONS[operation.type].fields.map(field => ({
    compactLabel: field.summaryLabel as string,
    compactStyle: 'label' as 'label' | 'dimension' | 'suffix',
    ...field,
    animatable: !('animatable' in field) || field.animatable !== false,
    ...numericField(object.operation.anyOf, operation.type, field.key),
    value: (operation as unknown as Record<BuilderDimension, number>)[field.key],
  }))
}

export function createBuilderOperation(type: BuilderShape): BuilderOperation {
  return { type, ...Object.fromEntries(BUILDER_OPERATIONS[type].fields.map(field =>
    [field.key, numericField(object.operation.anyOf, type, field.key).default])) } as BuilderOperation
}

export const BUILDER_LIMITS = {
  objects: schema.$defs.builder.properties.objects.maxItems,
  nameLength: object.name.maxLength,
  modifiers: object.modifiers.maxItems,
  arrangements: object.arrangements.maxItems,
  expandedPrimitives: renderingPolicy.limits.expandedPrimitives,
  groups: renderingPolicy.limits.groups,
  groupDepth: renderingPolicy.limits.groupDepth,
} as const

export const BUILDER_TRANSFORMS = object.transform.properties
export const BUILDER_RENDER_SETTINGS = schema.$defs.builder.properties.rendering.properties
export const BUILDER_MATERIAL = object.material.properties
export const BUILDER_GROUP_TRANSFORMS = group.transform.properties
export const BUILDER_GROUP_BLEND = numericField(group.operation.anyOf, 'smooth-union', 'blend')
export type BuilderGroupTarget = `${'position' | 'rotation'}.${'x' | 'y' | 'z'}` | 'scale' | 'blend'
  | 'material.metalness' | 'material.shininess'
export const BUILDER_GROUP_RANGES = {
  'position.x': BUILDER_GROUP_TRANSFORMS.position.properties.x,
  'position.y': BUILDER_GROUP_TRANSFORMS.position.properties.y,
  'position.z': BUILDER_GROUP_TRANSFORMS.position.properties.z,
  'rotation.x': BUILDER_GROUP_TRANSFORMS.rotation.properties.x,
  'rotation.y': BUILDER_GROUP_TRANSFORMS.rotation.properties.y,
  'rotation.z': BUILDER_GROUP_TRANSFORMS.rotation.properties.z,
  scale: BUILDER_GROUP_TRANSFORMS.scale,
  blend: BUILDER_GROUP_BLEND,
  'material.metalness': BUILDER_MATERIAL.metalness,
  'material.shininess': BUILDER_MATERIAL.shininess,
} satisfies Record<BuilderGroupTarget, NumberRule>

export const BUILDER_MODIFIERS = {
  expand: { label: 'Expand', amount: numericField(object.modifiers.items.anyOf, 'expand', 'amount') },
  shell: { label: 'Shell', thickness: numericField(object.modifiers.items.anyOf, 'shell', 'thickness') },
  twist: { label: 'Twist', amount: numericField(object.modifiers.items.anyOf, 'twist', 'amount') },
} as const satisfies Record<BuilderModifier['type'], unknown>

export const BUILDER_ARRANGEMENTS = {
  linear: { label: 'Line', count: numericField(object.arrangements.items.anyOf, 'linear', 'count'),
    spacing: numericField(object.arrangements.items.anyOf, 'linear', 'spacing') },
  radial: { label: 'Ring', count: numericField(object.arrangements.items.anyOf, 'radial', 'count'),
    radius: numericField(object.arrangements.items.anyOf, 'radial', 'radius') },
} as const satisfies Record<BuilderArrangement['type'], unknown>

export const BUILDER_SPIN = { speed: numericField(object.motion.anyOf, 'spin', 'speed') }

function defaults(rules: readonly Branch[], type: string) {
  return { type, ...Object.fromEntries(Object.entries(branch(rules, type))
    .filter(([key, rule]) => key !== 'type' && rule && 'default' in rule)
    .map(([key, rule]) => [key, rule!.default])) }
}

export function createBuilderModifier(type: BuilderModifier['type']): BuilderModifier {
  return defaults(object.modifiers.items.anyOf, type) as BuilderModifier
}

export function createBuilderArrangement(type: BuilderArrangement['type']): BuilderArrangement {
  return defaults(object.arrangements.items.anyOf, type) as BuilderArrangement
}

export function createBuilderMotion(type: BuilderMotion['type']): BuilderMotion {
  return defaults(object.motion.anyOf, type) as BuilderMotion
}

/** The compiler's live uniform limits match the editable property's transport limits. */
export const BUILDER_BINDING_RANGES = {
  'position.x': BUILDER_TRANSFORMS.position.properties.x,
  'position.y': BUILDER_TRANSFORMS.position.properties.y,
  'position.z': BUILDER_TRANSFORMS.position.properties.z,
  'rotation.x': BUILDER_TRANSFORMS.rotation.properties.x,
  'rotation.y': BUILDER_TRANSFORMS.rotation.properties.y,
  'rotation.z': BUILDER_TRANSFORMS.rotation.properties.z,
  'scale.x': BUILDER_TRANSFORMS.scale.properties.x,
  'scale.y': BUILDER_TRANSFORMS.scale.properties.y,
  'scale.z': BUILDER_TRANSFORMS.scale.properties.z,
  'material.metalness': BUILDER_MATERIAL.metalness,
  'material.shininess': BUILDER_MATERIAL.shininess,
} satisfies Record<BuilderBinding['target'], NumberRule>

export const BUILDER_BINDING_RULES = object.bindings.items.properties
export const BUILDER_BINDING_LIMIT = object.bindings.maxItems

export function createBuilderBinding(target: BuilderBinding['target'] = 'scale.x', source: BuilderBinding['source'] = 'bass-level'): BuilderBinding {
  return { target, source, mode: BUILDER_BINDING_RULES.mode.default as BuilderBinding['mode'],
    amount: BUILDER_BINDING_RULES.amount.default, offset: BUILDER_BINDING_RULES.offset.default,
    attack: BUILDER_BINDING_RULES.attack.default, release: BUILDER_BINDING_RULES.release.default }
}
