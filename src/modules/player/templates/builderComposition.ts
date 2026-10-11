import type { BuilderGroup, BuilderObject, BuilderSceneDocument } from './sceneContract'
import policy from '../../../../contracts/scenes/builder-rendering.v1.json'

export type BuilderCompositionNode =
  | { kind: 'object'; object: BuilderObject; index: number }
  | { kind: 'group'; group: BuilderGroup; index: number }

/** Flat documents have the same implicit order they had before groups existed. */
export function builderCompositionRoots(document: BuilderSceneDocument): readonly string[] {
  return document.composition?.roots ?? document.objects.map(object => object.id)
}

/** Registry indices remain stable when the forest's display order changes. */
export function builderCompositionNodes(document: BuilderSceneDocument): Map<string, BuilderCompositionNode> {
  return new Map<string, BuilderCompositionNode>([
    ...document.objects.map((object, index) => [object.id, { kind: 'object', object, index }] as const),
    ...(document.composition?.groups ?? []).map((group, index) => [group.id, { kind: 'group', group, index }] as const),
  ])
}

/** Run only after the shared field schema has normalized the document. */
export function validateBuilderComposition(document: BuilderSceneDocument, fail: (path: string, detail: string) => never) {
  const composition = document.composition
  if (!composition) return
  const maximumDepth = policy.limits.groupDepth
  const maximumReferences = policy.limits.expandedPrimitives + policy.limits.groups
  if (composition.groups.length > policy.limits.groups) fail('scene.composition.groups', `expected at most ${policy.limits.groups} groups`)
  if (composition.roots.length > maximumReferences) fail('scene.composition.roots', `expected at most ${maximumReferences} roots`)
  const ids = new Set<string>()
  for (const [index, object] of document.objects.entries()) {
    if (ids.has(object.id)) fail(`scene.objects[${index}].id`, 'duplicate node ID')
    ids.add(object.id)
  }
  for (const [index, group] of composition.groups.entries()) {
    if (ids.has(group.id)) fail(`scene.composition.groups[${index}].id`, 'duplicate node ID')
    ids.add(group.id)
    if (!group.children.length) fail(`scene.composition.groups[${index}].children`, 'a group must contain at least one child')
    if (group.children.length > maximumReferences) fail(`scene.composition.groups[${index}].children`, `expected at most ${maximumReferences} children`)
  }
  const nodes = builderCompositionNodes(document)
  const used = new Set<string>()
  const ancestors = new Set<string>()
  const visit = (id: string, path: string, depth: number) => {
    const node = nodes.get(id)
    if (!node) return fail(path, 'unknown node reference')
    if (ancestors.has(id)) return fail(path, 'cyclic group references are not supported')
    if (used.has(id)) return fail(path, 'each node must have exactly one parent or root position')
    used.add(id)
    if (node.kind === 'object') return
    if (depth >= maximumDepth) fail(path, `group depth exceeds ${maximumDepth}`)
    ancestors.add(id)
    node.group.children.forEach((child, index) => visit(child,
      `scene.composition.groups[${node.index}].children[${index}]`, depth + 1))
    ancestors.delete(id)
  }
  composition.roots.forEach((id, index) => visit(id, `scene.composition.roots[${index}]`, 0))
  for (const [id, node] of nodes) if (!used.has(id)) {
    fail(node.kind === 'object' ? `scene.objects[${node.index}].id` : `scene.composition.groups[${node.index}].id`,
      'every node must be reachable from exactly one root')
  }
}
