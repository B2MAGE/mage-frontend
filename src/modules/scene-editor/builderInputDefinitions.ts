import type { BuilderDriverSource } from '@modules/player'

type InputDefinition = {
  label: string
  valueType: 'scalar' | 'vector'
  components?: Partial<Record<'x' | 'y' | 'z', string>>
}

/** Authoring labels/types shared by simple influences and combined inputs. */
export const BUILDER_INPUTS = {
  time: { label: 'Time', valueType: 'scalar' },
  'scene-size': { label: 'Scene size response', valueType: 'scalar' },
  'scene-pointer-down': { label: 'Scene pointer press', valueType: 'scalar' },
  'scene-pointer': { label: 'Scene pointer', valueType: 'vector', components: { x: 'horizontal', y: 'vertical' } },
  'bass-level': { label: 'Bass level', valueType: 'scalar' },
  'mid-level': { label: 'Mid level', valueType: 'scalar' },
  'treble-level': { label: 'Treble level', valueType: 'scalar' },
  'overall-level': { label: 'Whole mix level', valueType: 'scalar' },
  'bass-hit': { label: 'Bass hits', valueType: 'scalar' },
  'mid-hit': { label: 'Mid hits', valueType: 'scalar' },
  'treble-hit': { label: 'Treble hits', valueType: 'scalar' },
  'overall-hit': { label: 'Whole mix hits', valueType: 'scalar' },
  'pointer-x': { label: 'Pointer horizontal', valueType: 'scalar' },
  'pointer-y': { label: 'Pointer vertical', valueType: 'scalar' },
  'pointer-down': { label: 'Pointer press', valueType: 'scalar' },
  'local-position': { label: 'Local position', valueType: 'vector' },
  'group-position': { label: 'Parent group position', valueType: 'vector' },
  'world-position': { label: 'World position', valueType: 'vector' },
  'view-ray': { label: 'View ray', valueType: 'vector' },
} as const satisfies Record<BuilderDriverSource, InputDefinition>

const inputs = Object.entries(BUILDER_INPUTS)
export const SCALAR_INPUTS = inputs.filter(([, definition]) => definition.valueType === 'scalar')
  .map(([value, definition]) => ({ value, label: definition.label }))
export const VECTOR_INPUTS = inputs.filter(([, definition]) => definition.valueType === 'vector')
  .map(([value, definition]) => ({ value, label: `${definition.label} (XYZ)` }))
export const DRIVER_SOURCES = inputs.flatMap(([value, definition]) => {
  if (definition.valueType === 'scalar') return [{ value, label: definition.label }]
  const components = 'components' in definition ? definition.components : { x: 'X', y: 'Y', z: 'Z' }
  return Object.entries(components).map(([axis, label]) => ({ value: `${value}.${axis}`, label: `${definition.label} ${label}` }))
})
