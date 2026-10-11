import { BUILDER_LIMITS, BUILDER_GROUP_TRANSFORMS, builderCompositionRoots, type BuilderFrame, type BuilderGroup, type BuilderObject, type BuilderSceneDocument } from '@modules/player'

export const BUILDER_GROUP_LIMIT = BUILDER_LIMITS.groups
export const BUILDER_GROUP_DEPTH = BUILDER_LIMITS.groupDepth
export type BuilderNode = BuilderObject | BuilderGroup
export const isBuilderGroup = (node: BuilderNode): node is BuilderGroup => 'children' in node
export const identityBuilderFrame = (): BuilderFrame => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 })
export const builderRoots = (document: BuilderSceneDocument) => [...builderCompositionRoots(document)]
export const builderGroups = (document: BuilderSceneDocument) => document.composition?.groups ?? []
export function findBuilderNode(document: BuilderSceneDocument, id: string | null): BuilderNode | undefined {
  return document.objects.find(object => object.id === id) ?? builderGroups(document).find(group => group.id === id)
}
export const builderParent = (document: BuilderSceneDocument, id: string) => builderGroups(document).find(group => group.children.includes(id))
export const builderSiblings = (document: BuilderSceneDocument, id: string) => builderParent(document, id)?.children ?? builderRoots(document)

/** Authoring order is the hierarchy order; the object registry order is independent. */
export function builderOrderedNodes(document: BuilderSceneDocument): BuilderNode[] {
  const result: BuilderNode[] = []
  const seen = new Set<string>()
  function visit(id: string) {
    if (seen.has(id)) return
    seen.add(id)
    const node = findBuilderNode(document, id)
    if (!node) return
    result.push(node)
    if (isBuilderGroup(node)) node.children.forEach(visit)
  }
  builderRoots(document).forEach(visit)
  return result
}

function composition(document: BuilderSceneDocument) {
  return structuredClone(document.composition ?? { version: 1 as const, roots: builderRoots(document), groups: [] })
}
function childrenAt(document: BuilderSceneDocument, parentId: string | null) {
  return parentId ? builderGroups(document).find(group => group.id === parentId)?.children : builderRoots(document)
}
function replaceChildren(document: BuilderSceneDocument, parentId: string | null, children: string[]): BuilderSceneDocument {
  const next = composition(document)
  if (parentId) next.groups = next.groups.map(group => group.id === parentId ? { ...group, children } : group)
  else next.roots = children
  return { ...document, composition: next }
}
function descendantIds(document: BuilderSceneDocument, id: string): string[] {
  const node = findBuilderNode(document, id)
  return node ? [id, ...(isBuilderGroup(node) ? node.children.flatMap(child => descendantIds(document, child)) : [])] : []
}
function groupDepth(document: BuilderSceneDocument, id: string): number {
  const node = findBuilderNode(document, id)
  return node && isBuilderGroup(node) ? 1 + Math.max(0, ...node.children.map(child => groupDepth(document, child))) : 0
}
function ancestorCount(document: BuilderSceneDocument, id: string): number {
  const parent = builderParent(document, id)
  return parent ? 1 + ancestorCount(document, parent.id) : 0
}

export function builderGroupingIssue(document: BuilderSceneDocument, ids: readonly string[]): string | null {
  if (ids.length < 2) return 'Select at least two objects or groups to group together.'
  if (new Set(ids).size !== ids.length || ids.some(id => !findBuilderNode(document, id))) return 'Select existing objects or groups.'
  const parent = builderParent(document, ids[0])?.id
  if (ids.some(id => builderParent(document, id)?.id !== parent)) return 'Select items in the same group, or at the scene level.'
  if (builderGroups(document).length >= BUILDER_GROUP_LIMIT) return `Use at most ${BUILDER_GROUP_LIMIT} groups.`
  if (ancestorCount(document, ids[0]) + 1 + Math.max(...ids.map(id => groupDepth(document, id))) > BUILDER_GROUP_DEPTH) {
    return `Groups can nest at most ${BUILDER_GROUP_DEPTH} levels deep.`
  }
  return null
}

export function groupBuilderNodes(document: BuilderSceneDocument, ids: readonly string[], id: string): BuilderSceneDocument {
  const issue = builderGroupingIssue(document, ids)
  if (issue) throw new Error(issue)
  if (findBuilderNode(document, id)) throw new Error('The group ID is already in use.')
  const parentId = builderParent(document, ids[0])?.id ?? null
  const siblings = childrenAt(document, parentId)!
  const chosen = new Set(ids)
  const children = siblings.filter(child => chosen.has(child))
  const first = siblings.indexOf(children[0])
  const nextSiblings = siblings.filter(child => !chosen.has(child))
  nextSiblings.splice(first, 0, id)
  const next = replaceChildren(document, parentId, nextSiblings)
  const group: BuilderGroup = { id, name: `Group ${builderGroups(document).length + 1}`, children,
    transform: identityBuilderFrame(), operation: { type: 'union' } }
  return { ...next, composition: { ...next.composition!, groups: [...next.composition!.groups, group] } }
}

// Forward rotations match the compiler: local X, then Y, then Z.
type Matrix3 = [number, number, number, number, number, number, number, number, number]
function rotationMatrix({ x, y, z }: BuilderFrame['rotation']): Matrix3 {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z)
  return [e * c, e * d * b - f * a, e * d * a + f * b, f * c, f * d * b + e * a, f * d * a - e * b, -d, c * b, c * a]
}
function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3), col = index % 3
    return a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
  }) as Matrix3
}
const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value
function matrixRotation(m: Matrix3): BuilderFrame['rotation'] {
  const y = Math.asin(Math.max(-1, Math.min(1, -m[6])))
  return { x: clean(Math.abs(m[6]) < .9999999 ? Math.atan2(m[7], m[8]) : 0), y: clean(y),
    z: clean(Math.abs(m[6]) < .9999999 ? Math.atan2(m[3], m[0]) : Math.atan2(-m[1], m[4])) }
}
function rotate(m: Matrix3, p: BuilderFrame['position']) {
  return { x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
    y: m[3] * p.x + m[4] * p.y + m[5] * p.z, z: m[6] * p.x + m[7] * p.y + m[8] * p.z }
}
export function composeBuilderFrames(parent: BuilderFrame, child: BuilderFrame): BuilderFrame {
  const matrix = rotationMatrix(parent.rotation)
  const translated = rotate(matrix, child.position)
  return { position: { x: clean(parent.position.x + parent.scale * translated.x),
    y: clean(parent.position.y + parent.scale * translated.y), z: clean(parent.position.z + parent.scale * translated.z) },
    rotation: matrixRotation(multiply(matrix, rotationMatrix(child.rotation))), scale: parent.scale * child.scale }
}
function inverseFrame(frame: BuilderFrame): BuilderFrame {
  const m = rotationMatrix(frame.rotation)
  const transpose: Matrix3 = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
  const p = rotate(transpose, frame.position)
  return { position: { x: -p.x / frame.scale, y: -p.y / frame.scale, z: -p.z / frame.scale },
    rotation: matrixRotation(transpose), scale: 1 / frame.scale }
}
function assertFrameRange(frame: BuilderFrame) {
  const position = BUILDER_GROUP_TRANSFORMS.position.properties.x
  const scale = BUILDER_GROUP_TRANSFORMS.scale
  if (Object.values(frame.position).some(value => !Number.isFinite(value) || value < position.minimum || value > position.maximum)
    || !Number.isFinite(frame.scale) || frame.scale < scale.minimum || frame.scale > scale.maximum) {
    throw new Error('This move would exceed the supported position or scale range. Reduce the group transform first.')
  }
}
function withFrame(node: BuilderNode, frame: BuilderFrame): BuilderNode {
  assertFrameRange(frame)
  if (!isBuilderGroup(node) && frame.scale === 1 && Object.values(frame.position).every(value => value === 0)
    && Object.values(frame.rotation).every(value => value === 0)) {
    const result = { ...node }
    delete result.frame
    return result
  }
  return isBuilderGroup(node) ? { ...node, transform: frame } : { ...node, frame }
}
export function builderWorldFrame(document: BuilderSceneDocument, id: string): BuilderFrame {
  const node = findBuilderNode(document, id)
  if (!node) return identityBuilderFrame()
  const frame = isBuilderGroup(node) ? node.transform : node.frame ?? identityBuilderFrame()
  const parent = builderParent(document, id)
  return parent ? composeBuilderFrames(builderWorldFrame(document, parent.id), frame) : frame
}
function replaceNode(document: BuilderSceneDocument, node: BuilderNode): BuilderSceneDocument {
  return isBuilderGroup(node) ? { ...document, composition: { ...composition(document),
    groups: builderGroups(document).map(group => group.id === node.id ? node : group) } }
    : { ...document, objects: document.objects.map(object => object.id === node.id ? node : object) }
}

export function updateBuilderGroup(document: BuilderSceneDocument, id: string, recipe: (group: BuilderGroup) => BuilderGroup) {
  const group = builderGroups(document).find(item => item.id === id)
  return group ? replaceNode(document, { ...recipe(structuredClone(group)), id: group.id, children: group.children }) : document
}
export function ungroupBuilderNode(document: BuilderSceneDocument, id: string): BuilderSceneDocument {
  const group = builderGroups(document).find(item => item.id === id)
  if (!group) return document
  let next = document
  for (const childId of group.children) {
    const child = findBuilderNode(document, childId)!
    const frame = isBuilderGroup(child) ? child.transform : child.frame ?? identityBuilderFrame()
    const placed = withFrame(child, composeBuilderFrames(group.transform, frame))
    next = replaceNode(next, group.material ? { ...placed, material: structuredClone(group.material) } : placed)
  }
  const parentId = builderParent(document, id)?.id ?? null
  next = replaceChildren(next, parentId, childrenAt(document, parentId)!.flatMap(child => child === id ? group.children : [child]))
  return { ...next, composition: { ...next.composition!, groups: next.composition!.groups.filter(item => item.id !== id) } }
}

export function removeBuilderNode(document: BuilderSceneDocument, id: string): BuilderSceneDocument {
  if (!findBuilderNode(document, id)) return document
  const removed = new Set(descendantIds(document, id))
  // Empty containers are removed with their final child.
  let changed = true
  while (changed) {
    changed = false
    for (const group of builderGroups(document)) if (!removed.has(group.id) && group.children.every(child => removed.has(child))) {
      removed.add(group.id); changed = true
    }
  }
  return { ...document, objects: document.objects.filter(object => !removed.has(object.id)),
    ...(document.composition ? { composition: { ...document.composition,
      roots: document.composition.roots.filter(child => !removed.has(child)),
      groups: document.composition.groups.filter(group => !removed.has(group.id)).map(group => ({ ...group, children: group.children.filter(child => !removed.has(child)) })) } } : {}) }
}

export function moveBuilderNode(document: BuilderSceneDocument, id: string, targetId: string): BuilderSceneDocument {
  if (id === targetId || !findBuilderNode(document, id) || !findBuilderNode(document, targetId)) return document
  if (builderParent(document, id)?.id !== builderParent(document, targetId)?.id) return document
  const siblings = [...builderSiblings(document, id)]
  const from = siblings.indexOf(id), to = siblings.indexOf(targetId)
  siblings.splice(from, 1); siblings.splice(to, 0, id)
  if (!document.composition) return { ...document, objects: siblings.map(child => document.objects.find(object => object.id === child)!) }
  return replaceChildren(document, builderParent(document, id)?.id ?? null, siblings)
}

export function reparentBuilderNode(document: BuilderSceneDocument, id: string, parentId: string | null): BuilderSceneDocument {
  const node = findBuilderNode(document, id)
  if (!node || (parentId && !builderGroups(document).some(group => group.id === parentId))) return document
  const previousParent = builderParent(document, id)?.id ?? null
  if (parentId === previousParent) return document
  if (parentId && descendantIds(document, id).includes(parentId)) throw new Error('A group cannot be moved inside itself or one of its children.')
  if ((parentId ? ancestorCount(document, parentId) + 1 : 0) + groupDepth(document, id) > BUILDER_GROUP_DEPTH) {
    throw new Error(`Groups can nest at most ${BUILDER_GROUP_DEPTH} levels deep.`)
  }
  const world = builderWorldFrame(document, id)
  const local = parentId ? composeBuilderFrames(inverseFrame(builderWorldFrame(document, parentId)), world) : world
  let next = replaceNode(document, withFrame(node, local))
  next = replaceChildren(next, previousParent, childrenAt(next, previousParent)!.filter(child => child !== id))
  next = replaceChildren(next, parentId, [...childrenAt(next, parentId)!, id])
  // Remove emptied old parents, without removing the moved subtree.
  while (next.composition?.groups.some(group => group.children.length === 0)) {
    const empty = next.composition.groups.find(group => group.children.length === 0)!
    next = removeBuilderNode(next, empty.id)
  }
  return next
}

export function duplicateBuilderNode(document: BuilderSceneDocument, id: string, nextId: (kind: 'object' | 'group') => string): BuilderSceneDocument {
  const node = findBuilderNode(document, id)
  if (!node) return document
  const ids = descendantIds(document, id)
  const copiedObjects = document.objects.filter(object => ids.includes(object.id))
  const copiedGroups = builderGroups(document).filter(group => ids.includes(group.id))
  const expanded = (objects: BuilderObject[]) => objects.reduce((total, object) => total + object.arrangements.reduce((copies, stage) => copies * stage.count, 1), 0)
  if (document.objects.length + copiedObjects.length > BUILDER_LIMITS.objects
    || expanded(document.objects) + expanded(copiedObjects) > BUILDER_LIMITS.expandedPrimitives
    || builderGroups(document).length + copiedGroups.length > BUILDER_GROUP_LIMIT) throw new Error('There is not enough room to duplicate this item and all its children.')
  const remapped = new Map(ids.map(child => [child, nextId(isBuilderGroup(findBuilderNode(document, child)!) ? 'group' : 'object')]))
  const copyName = (name: string, childId: string) => childId === id ? `${name} copy`.slice(0, BUILDER_LIMITS.nameLength) : name
  const objects = copiedObjects.map(object => ({ ...structuredClone(object), id: remapped.get(object.id)!, name: copyName(object.name, object.id) }))
  const groups = copiedGroups.map(group => ({ ...structuredClone(group), id: remapped.get(group.id)!, name: copyName(group.name, group.id), children: group.children.map(child => remapped.get(child)!) }))
  let next = { ...document, objects: [...document.objects, ...objects] }
  if (document.composition) {
    next = { ...next, composition: { ...composition(document), groups: [...builderGroups(document), ...groups] } }
    const parentId = builderParent(document, id)?.id ?? null
    next = replaceChildren(next, parentId, [...childrenAt(next, parentId)!, remapped.get(id)!])
  }
  return next
}
