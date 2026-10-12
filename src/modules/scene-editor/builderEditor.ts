import {
  BUILDER_LIMITS,
  BUILDER_MATERIAL,
  BUILDER_OPERATIONS,
  BUILDER_TRANSFORMS,
  createBuilderOperation,
  builderDriverTargetRange,
  parseSceneDocument,
  type BuilderObject,
  type BuilderShape,
  type BuilderSceneDocument,
  type TemplateId,
} from '@modules/player'
import type { SceneData, SceneEditorModel } from './sceneEditor'
import { duplicateBuilderNode, moveBuilderNode, removeBuilderNode } from './builderGroups'
import {
  changeAuthoredBranch,
  changeAuthoredMusicSettings,
  changeAuthoredValue,
  createTemplateScene,
  getTemplateEditorModel,
  getTemplateEditorSceneData,
  type TemplateFieldPath,
} from './templateEditor'

export { BUILDER_SHAPES, createBuilderOperation, type BuilderShape } from '@modules/player'

export const BUILDER_EXPANDED_PRIMITIVE_LIMIT = BUILDER_LIMITS.expandedPrimitives

export function builderObjectExpandedCount(object: BuilderObject) {
  return object.arrangements.reduce((count, arrangement) => count * arrangement.count, 1)
}

export function builderSceneExpandedCount(document: BuilderSceneDocument) {
  return document.objects.reduce((count, object) => count + builderObjectExpandedCount(object), 0)
}

function nextObjectNumber(objects: readonly Pick<BuilderObject, 'id'>[]) {
  const ids = new Set(objects.map(object => object.id))
  const largest = objects.reduce((current, object) => {
    const match = /^object-(\d+)$/.exec(object.id)
    const suffix = match ? Number(match[1]) : NaN
    return Number.isSafeInteger(suffix) ? Math.max(current, suffix) : current
  }, 0)
  let number = largest < Number.MAX_SAFE_INTEGER ? largest + 1 : 1
  while (ids.has(`object-${number}`)) number += 1
  return number
}

export function createBuilderObject(type: BuilderShape, objects: readonly BuilderObject[] = []): BuilderObject {
  const number = nextObjectNumber(objects)
  const vector = (field: keyof typeof BUILDER_TRANSFORMS) => {
    const { x, y, z } = BUILDER_TRANSFORMS[field].properties
    return { x: x.default, y: y.default, z: z.default }
  }
  return {
    id: `object-${number}`,
    name: `${BUILDER_OPERATIONS[type].label} ${number}`,
    operation: createBuilderOperation(type),
    transform: {
      position: vector('position'),
      rotation: vector('rotation'),
      scale: vector('scale'),
    },
    material: { color: BUILDER_MATERIAL.color.default, metalness: BUILDER_MATERIAL.metalness.default,
      shininess: BUILDER_MATERIAL.shininess.default },
    modifiers: [],
    arrangements: [],
    motion: { type: 'none' },
    bindings: [],
  }
}

export function createBuilderScene(templateId: TemplateId = 'embedded-scene-0'): BuilderSceneDocument {
  const template = createTemplateScene(templateId)
  const object = createBuilderObject('sphere')
  object.material = { color: '#8066ff', metalness: 0.5, shininess: 0.8 }
  const document = parseSceneDocument({
    schemaVersion: 1,
    kind: 'builder',
    builderVersion: 1,
    objects: [object],
    parameters: { ...template.parameters, scale: 1 },
    settings: template.settings,
  })
  if (document.kind !== 'builder') throw new Error('A Builder scene is required.')
  return document
}

/** Editor identity only. Draft values remain visible until the user repairs them. */
export function isBuilderEditorDocument(value: SceneData): value is BuilderSceneDocument {
  return value.schemaVersion === 1 && value.kind === 'builder' && value.builderVersion === 1
    && Array.isArray(value.objects) && !!value.parameters && typeof value.parameters === 'object'
    && !!value.settings && typeof value.settings === 'object'
}

export function getBuilderEditorModel(document: BuilderSceneDocument) {
  return getTemplateEditorModel(document)
}

export function getBuilderEditorSceneData(document: BuilderSceneDocument) {
  return getTemplateEditorSceneData(document)
}

export function changeBuilderBranch<K extends keyof SceneEditorModel>(
  document: BuilderSceneDocument,
  branch: K,
  value: SceneEditorModel[K],
) {
  return changeAuthoredBranch(document, branch, value)
}

export function changeBuilderMusicSettings(document: BuilderSceneDocument, data: SceneData) {
  return changeAuthoredMusicSettings(document, data)
}

export function changeBuilderValue(document: BuilderSceneDocument, path: TemplateFieldPath, value: number | string | boolean) {
  return changeAuthoredValue(document, path, value)
}

export function addBuilderObject(document: BuilderSceneDocument, type: BuilderShape, objectId?: string) {
  if (document.objects.length >= BUILDER_LIMITS.objects || builderSceneExpandedCount(document) >= BUILDER_EXPANDED_PRIMITIVE_LIMIT) return document
  if (objectId && [...document.objects, ...(document.composition?.groups ?? [])].some(object => object.id === objectId)) return document
  const object = createBuilderObject(type, document.objects)
  if (!objectId) object.id = `object-${nextObjectNumber([...document.objects, ...(document.composition?.groups ?? [])])}`
  const added = objectId ? { ...object, id: objectId } : object
  return { ...document, objects: [...document.objects, added],
    ...(document.composition ? { composition: { ...document.composition, roots: [...document.composition.roots, added.id] } } : {}) }
}

export function updateBuilderObject(
  document: BuilderSceneDocument,
  objectId: string,
  recipe: (object: BuilderObject) => BuilderObject,
) {
  if (!document.objects.some(object => object.id === objectId)) return document
  return {
    ...document,
    objects: document.objects.map(object => {
      if (object.id !== objectId) return object
      const next = { ...recipe(structuredClone(object)), id: object.id }
      if (next.drivers && next.operation.type !== object.operation.type) {
        next.drivers = next.drivers.filter(driver => builderDriverTargetRange(next, driver.target))
      }
      return next
    }),
  }
}

export function duplicateBuilderObject(document: BuilderSceneDocument, objectId: string, copyId?: string) {
  if (!document.objects.some(object => object.id === objectId)) return document
  const ids = [...document.objects, ...(document.composition?.groups ?? [])]
  if (copyId && ids.some(object => object.id === copyId)) return document
  let next = nextObjectNumber(ids)
  try {
    return duplicateBuilderNode(document, objectId, kind => copyId && kind === 'object' ? copyId : `${kind}-${next++}`)
  } catch { return document }
}

export function removeBuilderObject(document: BuilderSceneDocument, objectId: string) {
  return removeBuilderNode(document, objectId)
}

/** Object references and selection stay attached to IDs as positions change. */
export function moveBuilderObject(document: BuilderSceneDocument, objectId: string, targetId: string) {
  return moveBuilderNode(document, objectId, targetId)
}
