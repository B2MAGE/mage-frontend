import { validateBuilderDriverExpression, type BuilderBinding, type BuilderDriverExpression, type BuilderDriverSource, type BuilderSceneDocument } from '@modules/player'
import { BUILDER_BINDING_SOURCE_LABELS } from './builderBindings'
import { builderParent, type BuilderNode } from './builderGroups'
import { driverTargets } from './builderDrivers'

type InspectorAnimationResponse = { inputs: BuilderDriverSource[]; targets: string[] }
export type InspectorAnimationOwner = {
  id: string; name: string; inherited: boolean; inputs: BuilderDriverSource[]; responses: InspectorAnimationResponse[]
}

function collectInputs(expression: BuilderDriverExpression, inputs: Set<BuilderDriverSource>) {
  switch (expression.type) {
    case 'input': inputs.add(expression.source); break
    case 'add': case 'multiply':
      collectInputs(expression.left, inputs)
      collectInputs(expression.right, inputs)
      break
    case 'constant': break
    default: collectInputs(expression.input, inputs)
  }
}

/** Include native and surface inputs; the compiler's `signals` set only counts extra uniforms. */
export function builderInspectorInputs(document: BuilderSceneDocument | null, objectId: string | null) {
  const owners: InspectorAnimationOwner[] = []
  if (!document) return owners
  let node: BuilderNode | undefined = document.objects.find(object => object.id === objectId)
  while (node) {
    const inputs = new Set<BuilderDriverSource>()
    const responses = new Map<string, InspectorAnimationResponse>()
    const targets = driverTargets(node)
    for (const driver of node.drivers ?? []) {
      try {
        validateBuilderDriverExpression(driver.expression)
        const sources = new Set<BuilderDriverSource>()
        collectInputs(driver.expression, sources)
        if (!sources.size) continue
        sources.forEach(source => inputs.add(source))
        const key = [...sources].sort().join('|')
        const response = responses.get(key) ?? { inputs: [...sources], targets: [] }
        const label = targets.find(target => target.value === driver.target)?.label ?? driver.target
        if (!response.targets.includes(label)) response.targets.push(label)
        responses.set(key, response)
      } catch { /* Incomplete draft expressions do not have inspectable inputs. */ }
    }
    if (inputs.size) owners.push({ id: node.id, name: node.name, inherited: node.id !== objectId, inputs: [...inputs], responses: [...responses.values()] })
    node = builderParent(document, node.id)
  }
  return owners
}

export type MeasuredAnimationInput = BuilderBinding['source'] | 'scene-size'
export const isMeasuredAnimationInput = (source: BuilderDriverSource): source is MeasuredAnimationInput =>
  source === 'scene-size' || Object.hasOwn(BUILDER_BINDING_SOURCE_LABELS, source)
