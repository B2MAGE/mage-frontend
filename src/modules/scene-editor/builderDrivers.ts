import { BUILDER_BINDING_RANGES, BUILDER_DRIVER_LIMITS, BUILDER_GROUP_RANGES, builderOperationFields,
  type BuilderDriver, type BuilderDriverExpression, type BuilderDriverTarget, type BuilderGroup, type BuilderObject } from '@modules/player'
import { BUILDER_BINDING_SOURCE_LABELS, BUILDER_BINDING_TARGET_LABELS } from './builderBindings'

export type DriverPreset = 'pulse' | 'wobble' | 'spin' | 'follow'
export type DriverPresetValues = {
  preset: DriverPreset; source: string; speed: number; amount: number; phase: number; offset: number; minimum: number; maximum: number
  audioDriven?: boolean
  /** Imported affine inputs retain their absent influence clamp until limits are explicitly added. */
  unclamped?: boolean
}
export const isAudioPulse = (values: Pick<DriverPresetValues, 'preset' | 'source'>) => values.preset === 'pulse'
  && /^(bass|mid|treble|overall)-(hit|level)$/.test(values.source)
// Artistic limits are optional; the compiler still bounds every final property.
// Keep the clamp wrapper so Follow(Time) remains distinct from a Spin expression.
export const DRIVER_INFLUENCE_RANGE = {
  minimum: -BUILDER_DRIVER_LIMITS.constantMagnitude,
  maximum: BUILDER_DRIVER_LIMITS.constantMagnitude,
}
export const DRIVER_PRESETS = [
  { value: 'pulse', label: 'Pulse' }, { value: 'wobble', label: 'Wobble' },
  { value: 'spin', label: 'Spin' }, { value: 'follow', label: 'Follow input' },
] as const
export const DRIVER_SOURCES = [
  { value: 'time', label: 'Time' },
  { value: 'scene-size', label: 'Scene size response' },
  { value: 'scene-pointer-down', label: 'Scene pointer press' },
  { value: 'scene-pointer.x', label: 'Scene pointer horizontal' },
  { value: 'scene-pointer.y', label: 'Scene pointer vertical' },
  ...Object.entries(BUILDER_BINDING_SOURCE_LABELS).map(([value, label]) => ({ value, label })),
  ...(['local-position', 'group-position', 'world-position', 'view-ray'] as const).flatMap(source =>
    (['x', 'y', 'z'] as const).map(axis => ({ value: `${source}.${axis}`,
      label: `${{ 'local-position': 'Local position', 'group-position': 'Parent group position', 'world-position': 'World position', 'view-ray': 'View ray' }[source]} ${axis.toUpperCase()}` }))),
]
const constant = (value: number): BuilderDriverExpression => ({ type: 'constant', value })
const multiply = (left: BuilderDriverExpression, right: BuilderDriverExpression): BuilderDriverExpression => ({ type: 'multiply', left, right })
const add = (left: BuilderDriverExpression, right: BuilderDriverExpression): BuilderDriverExpression => ({ type: 'add', left, right })

export function driverInput(source: string): BuilderDriverExpression {
  const [name, axis] = source.split('.')
  const input: BuilderDriverExpression = { type: 'input', source: name as Extract<BuilderDriverExpression, { type: 'input' }>['source'] }
  return axis ? { type: 'component', input, axis: axis as 'x' | 'y' | 'z' } : input
}

/** Named controls author a bounded expression. There is no executable text or formula parser. */
export function createDriverPresetExpression(values: DriverPresetValues): BuilderDriverExpression {
  const input = driverInput(values.preset === 'spin' ? 'time' : values.source)
  if (values.preset === 'spin') return add(multiply(input, constant(values.speed)), constant(values.phase))
  // Audio inputs already carry a measured level or hit envelope. Feeding their
  // strength into cosine inverts hits and flattens quieter frequency levels.
  if (isAudioPulse(values)) return { type: 'clamp', min: values.minimum, max: values.maximum,
    input: add(multiply({ type: 'clamp', input, min: 0, max: 1 }, constant(values.amount)), constant(values.offset)) }
  let signal: BuilderDriverExpression = input
  if (values.preset !== 'follow') {
    signal = add(multiply(input, constant(values.speed)), constant(values.phase))
    if (values.preset === 'pulse' || values.preset === 'wobble') signal = { type: values.preset === 'pulse' ? 'cos' : 'sin', input: signal }
  }
  // Pulse ranges from zero to Amount; Wobble ranges from -Amount to +Amount.
  const amount = values.preset === 'pulse' ? values.amount / 2 : values.amount
  const offset = values.preset === 'pulse' ? values.offset + values.amount / 2 : values.offset
  const result = add(multiply(signal, constant(amount)), constant(offset))
  if (values.preset === 'follow' && values.unclamped
    && values.minimum === DRIVER_INFLUENCE_RANGE.minimum && values.maximum === DRIVER_INFLUENCE_RANGE.maximum) {
    // Keep an unbounded Follow(Time) distinct from the existing Spin form. Both
    // have the same arithmetic, but expose different controls in the inspector.
    return add(constant(offset), multiply(signal, constant(amount)))
  }
  return { type: 'clamp', input: result, min: values.minimum, max: values.maximum }
}

function scalar(expression: BuilderDriverExpression): number | undefined {
  return expression.type === 'constant' && typeof expression.value === 'number' ? expression.value : undefined
}
function sourceName(expression: BuilderDriverExpression): string | undefined {
  if (expression.type === 'input') return expression.source
  if (expression.type === 'component' && expression.input.type === 'input') return `${expression.input.source}.${expression.axis}`
}

function readNamedPreset(expression: BuilderDriverExpression): DriverPresetValues | null {
  if (expression.type === 'add') {
    if (expression.left.type !== 'multiply' || sourceName(expression.left.left) !== 'time') return null
    const speed = scalar(expression.left.right), phase = scalar(expression.right)
    return speed === undefined || phase === undefined ? null : { preset: 'spin', source: 'time', speed, phase, amount: 1, offset: 0, minimum: -Math.PI, maximum: Math.PI }
  }
  if (expression.type !== 'clamp' || expression.input.type !== 'add' || expression.input.left.type !== 'multiply') return null
  const offset = scalar(expression.input.right), amount = scalar(expression.input.left.right)
  if (offset === undefined || amount === undefined) return null
  const signal = expression.input.left.left
  const values = { amount, offset, minimum: expression.min, maximum: expression.max, speed: 1, phase: 0 }
  if (signal.type === 'clamp' && signal.min === 0 && signal.max === 1) {
    const source = sourceName(signal.input)
    if (source && isAudioPulse({ preset: 'pulse', source })) return { ...values, preset: 'pulse', source, audioDriven: true }
  }
  const source = sourceName(signal)
  if (source) return { ...values, preset: 'follow', source }
  const periodic = signal.type === 'sin' || signal.type === 'cos'
  if (!periodic) return null
  const argument = periodic ? signal.input : signal
  if (argument.type !== 'add' || argument.left.type !== 'multiply') return null
  const timedSource = sourceName(argument.left.left), speed = scalar(argument.left.right), phase = scalar(argument.right)
  if (!timedSource || speed === undefined || phase === undefined || (!periodic && timedSource !== 'time')) return null
  return { ...values, speed, phase, source: timedSource, preset: signal.type === 'cos' ? 'pulse' : 'wobble',
    ...(signal.type === 'cos' ? { amount: amount * 2, offset: Number((offset - amount).toPrecision(12)) } : {}) }
}

/** Recognize a single scalar input, optionally scaled and offset, without flattening a combined formula. */
function readAffineFollow(expression: BuilderDriverExpression): DriverPresetValues | null {
  let signal = expression.type === 'clamp' ? expression.input : expression
  let offset = 0, amount = 1
  if (signal.type === 'add') {
    const left = scalar(signal.left), right = scalar(signal.right)
    if (left !== undefined) { offset = left; signal = signal.right }
    else if (right !== undefined) { offset = right; signal = signal.left }
    else return null
  }
  if (signal.type === 'multiply') {
    const left = scalar(signal.left), right = scalar(signal.right)
    if (left !== undefined) { amount = left; signal = signal.right }
    else if (right !== undefined) { amount = right; signal = signal.left }
    else return null
  }
  const source = sourceName(signal)
  // Vector inputs need a component, and the inert scene-pointer Z component
  // has no source control. Do not turn either into an unusable scalar preset.
  if (!source || !DRIVER_SOURCES.some(option => option.value === source)) return null
  return {
    preset: 'follow', source, amount, offset, speed: 1, phase: 0,
    ...(expression.type === 'clamp' ? { minimum: expression.min, maximum: expression.max }
      : { ...DRIVER_INFLUENCE_RANGE, unclamped: true }),
  }
}

/** Reading controls never rewrites the authored expression or folds a combined formula into a preset. */
export function readDriverPreset(expression: BuilderDriverExpression): DriverPresetValues | null {
  return readNamedPreset(expression) ?? readAffineFollow(expression)
}

export function driverTargets(node: BuilderObject | BuilderGroup) {
  if ('children' in node) return Object.entries(BUILDER_GROUP_RANGES)
    .filter(([target]) => (target !== 'blend' || node.operation.type === 'smooth-union') && (!target.startsWith('material.') || node.material))
    .map(([value, range]) => ({ value: value as BuilderDriverTarget, label: value === 'scale' ? 'Overall scale' : value === 'blend' ? 'Blend radius'
      : BUILDER_BINDING_TARGET_LABELS[value as keyof typeof BUILDER_BINDING_TARGET_LABELS], ...range }))
  return [
    ...Object.entries(BUILDER_BINDING_RANGES).map(([value, range]) => ({ value: value as BuilderDriverTarget,
      label: BUILDER_BINDING_TARGET_LABELS[value as keyof typeof BUILDER_BINDING_TARGET_LABELS], ...range })),
    ...builderOperationFields(node.operation).filter(field => field.animatable).map(field => ({ value: `operation.${field.key}` as BuilderDriverTarget, label: field.title,
      minimum: field.minimum, maximum: field.maximum, default: field.default })),
  ]
}

export function defaultDriverPreset(node: BuilderObject | BuilderGroup, preset: DriverPreset): { driver: BuilderDriver; values: DriverPresetValues } {
  const targets = driverTargets(node)
  const target = targets.find(item => item.value === (preset === 'spin' || preset === 'wobble' ? 'rotation.y' : 'children' in node ? 'scale' : 'scale.x'))!
  const values: DriverPresetValues = { preset, source: preset === 'follow' ? 'bass-level' : 'time', speed: preset === 'spin' ? .25 : 1, amount: preset === 'spin' ? 1 : .25,
    phase: 0, offset: 0, ...DRIVER_INFLUENCE_RANGE }
  return { driver: { target: target.value, mode: 'add', expression: createDriverPresetExpression(values) }, values }
}

export function updateBuilderDriver<T extends BuilderObject | BuilderGroup>(node: T, index: number, change: Partial<BuilderDriver>): T {
  return { ...node, drivers: (node.drivers ?? []).map((driver, current) => current === index ? { ...driver, ...change } : driver) }
}

export function moveBuilderDriver<T extends BuilderObject | BuilderGroup>(node: T, index: number, direction: -1 | 1): T {
  const drivers = [...(node.drivers ?? [])]
  if (index + direction < 0 || index + direction >= drivers.length) return node
  ;[drivers[index], drivers[index + direction]] = [drivers[index + direction], drivers[index]]
  return { ...node, drivers }
}
