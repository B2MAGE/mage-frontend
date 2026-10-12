import type { BuilderUniform } from './builderCompiler'
import { builderDriverTargetRange } from './builderDrivers'
import type { BuilderBinding, BuilderDriverExpression, BuilderGroup, BuilderObject, BuilderSceneDocument } from './sceneContract'

type Owner = BuilderObject | BuilderGroup
export type BuilderDriverContext = { local: string; group: string; world: string }
type Axis = 'x' | 'y' | 'z'
type ExpressionSource = (context: BuilderDriverContext, axis?: Axis) => string
const bound = (value: string) => `max(-1000000,min(1000000,${value}))`
const literal = (value: number) => Object.is(value, -0) ? '0' : String(value)

/** Only validated enums and numeric slots enter this trusted shader generator. */
export function createBuilderDriverCompilation(document: BuilderSceneDocument, livePreview: boolean) {
  const uniforms: BuilderUniform[] = []
  const declarations: string[] = []
  const signals = new Map<BuilderBinding['source'], string>()
  let spatial = false
  const slot = (value: number, source?: BuilderBinding['source']) => {
    const driverSlot = uniforms.length
    const name = `builder_d${driverSlot}_${source ? source.replaceAll('-', '_') : 'value'}`
    const minimum = source ? source === 'pointer-x' || source === 'pointer-y' ? -1 : 0 : -1000
    const maximum = source ? 1 : 1000
    const target = source ? 'driver-signal' : 'driver-value'
    uniforms.push(source
      ? { driverSlot, target: 'driver-signal', source, name, initialValue: value, minimum, maximum }
      : { driverSlot, target: 'driver-value', name, initialValue: value, minimum, maximum })
    declarations.push(`let ${name}=input(${literal(livePreview || target === 'driver-signal' ? 0 : value)},${minimum},${maximum});`)
    return name
  }
  const inputSignal = (source: BuilderBinding['source']) => {
    let name = signals.get(source)
    if (!name) { name = slot(0, source); signals.set(source, name) }
    return name
  }
  const expression = (node: BuilderDriverExpression): ExpressionSource => {
    switch (node.type) {
      case 'constant': {
        if (typeof node.value === 'number') { const value = slot(node.value); return () => value }
        const values = { x: slot(node.value.x), y: slot(node.value.y), z: slot(node.value.z) }
        return (_context, axis) => values[axis!]
      }
      case 'input': {
        if (node.source === 'time') return () => '(time-floor(time/86400)*86400)'
        if (node.source === 'view-ray') { spatial = true; return (_context, axis) => `getRayDirection().${axis}` }
        if (node.source === 'world-position') { spatial = true; return (context, axis) => bound(`${context.world}.${axis}`) }
        if (node.source === 'group-position') { spatial = true; return (context, axis) => bound(`${context.group}.${axis}`) }
        if (node.source === 'local-position') { spatial = true; return (context, axis) => bound(`${context.local}.${axis}`) }
        const signal = inputSignal(node.source)
        return () => signal
      }
      case 'add': case 'multiply': {
        const left = expression(node.left), right = expression(node.right)
        return (context, axis) => bound(`(${left(context, axis)}${node.type === 'add' ? '+' : '*'}${right(context, axis)})`)
      }
      case 'sin': case 'cos': {
        const input = expression(node.input)
        return (context, axis) => `${node.type}(${bound(input(context, axis))})`
      }
      case 'clamp': {
        const input = expression(node.input), min = slot(node.min), max = slot(node.max)
        return (context, axis) => `max(${min},min(${max},${input(context, axis)}))`
      }
      case 'component': {
        const input = expression(node.input)
        return context => input(context, node.axis)
      }
    }
  }
  const owners = new Map<Owner, { source: ExpressionSource; target: string; mode: string }[]>()
  for (const owner of [...(document.composition?.groups ?? []), ...document.objects]) {
    owners.set(owner, (owner.drivers ?? []).map(driver => ({ ...driver, source: expression(driver.expression) })))
  }
  return {
    uniforms, declarations, spatial,
    hasLocal(owner: Owner) { return JSON.stringify(owner.drivers ?? []).includes('"local-position"') },
    owner(owner: Owner, suffix: string, context: BuilderDriverContext) {
      const drivers = owners.get(owner) ?? []
      const names = drivers.map((_driver, index) => `builder_driver_${suffix}_${index}`)
      const targetDeclarations: string[] = []
      const targets = new Map<string, string>()
      return {
        get declarations() {
          return drivers.map((driver, index) => `let ${names[index]}=${driver.source(context)};`).join('') + targetDeclarations.join('')
        },
        apply(target: string, baseline: string) {
          if (targets.has(target)) return targets.get(target)!
          let value = baseline
          drivers.forEach((driver, index) => {
            if (driver.target !== target) return
            const next = driver.mode === 'replace' ? names[index]
              : `(${value}${driver.mode === 'multiply' ? '*' : '+'}${names[index]})`
            const range = builderDriverTargetRange(owner, target)!
            // Angle-equivalent wrapping keeps a time-driven spin moving indefinitely.
            const result = target.startsWith('rotation.')
              ? `(${next}-floor((${next}+${Math.PI})/${Math.PI * 2})*${Math.PI * 2})`
              : `max(${literal(range.minimum)},min(${literal(range.maximum)},${next}))`
            value = `builder_value_${suffix}_${index}`
            targetDeclarations.push(`let ${value}=${result};`)
          })
          targets.set(target, value)
          return value
        },
      }
    },
  }
}
