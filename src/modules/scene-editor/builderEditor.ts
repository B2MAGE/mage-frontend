import {
  parseSceneDocument,
  type BuilderObject,
  type BuilderOperation,
  type BuilderSceneDocument,
  type TemplateId,
} from '@modules/player'
import type { SceneData, SceneEditorModel } from './sceneEditor'
import {
  changeAuthoredBranch,
  changeAuthoredMusicSettings,
  changeAuthoredValue,
  createTemplateScene,
  getTemplateEditorModel,
  getTemplateEditorSceneData,
  type TemplateFieldPath,
} from './templateEditor'

export type BuilderShape = BuilderOperation['type']

const shapeLabels: Record<BuilderShape, string> = {
  sphere: 'Sphere',
  box: 'Box',
  torus: 'Torus',
  cylinder: 'Cylinder',
}

export const BUILDER_SHAPES = (Object.keys(shapeLabels) as BuilderShape[]).map(value => ({
  label: shapeLabels[value],
  value,
}))

export function createBuilderOperation(type: BuilderShape): BuilderOperation {
  if (type === 'box') return { type, width: 1, height: 1, depth: 1 }
  if (type === 'torus') return { type, radius: 1, tube: 0.25 }
  if (type === 'cylinder') return { type, radius: 1, height: 2 }
  return { type: 'sphere', radius: 1 }
}

function nextObjectNumber(objects: readonly BuilderObject[]) {
  const ids = new Set(objects.map(object => object.id))
  let number = 1
  while (ids.has(`object-${number}`)) number += 1
  return number
}

export function createBuilderObject(type: BuilderShape, objects: readonly BuilderObject[] = []): BuilderObject {
  const number = nextObjectNumber(objects)
  return {
    id: `object-${number}`,
    name: `${shapeLabels[type]} ${number}`,
    operation: createBuilderOperation(type),
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    material: { color: '#8066ff', metalness: 0, shininess: 0.5 },
    bindings: [],
  }
}

export function createBuilderScene(templateId: TemplateId = 'embedded-scene-0'): BuilderSceneDocument {
  const template = createTemplateScene(templateId)
  const document = parseSceneDocument({
    schemaVersion: 1,
    kind: 'builder',
    builderVersion: 1,
    objects: [createBuilderObject('sphere')],
    parameters: { ...template.parameters, scale: 1 },
    settings: template.settings,
  })
  if (document.kind !== 'builder') throw new Error('A Builder scene is required.')
  return document
}

export function createBuilderSceneFromSettings(source: Pick<BuilderSceneDocument, 'parameters' | 'settings'>): BuilderSceneDocument {
  const document = parseSceneDocument({
    schemaVersion: 1,
    kind: 'builder',
    builderVersion: 1,
    objects: [createBuilderObject('sphere')],
    parameters: { ...source.parameters, scale: 1 },
    settings: source.settings,
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

export function applyBuilderTemplate(document: BuilderSceneDocument, templateId: TemplateId) {
  const template = createTemplateScene(templateId)
  return { ...document, parameters: { ...template.parameters, scale: document.parameters.scale }, settings: template.settings }
}

export function addBuilderObject(document: BuilderSceneDocument, type: BuilderShape) {
  if (document.objects.length >= 16) return document
  return { ...document, objects: [...document.objects, createBuilderObject(type, document.objects)] }
}

export function updateBuilderObject(
  document: BuilderSceneDocument,
  objectId: string,
  recipe: (object: BuilderObject) => BuilderObject,
) {
  return {
    ...document,
    objects: document.objects.map(object => object.id === objectId ? recipe(structuredClone(object)) : object),
  }
}

export function duplicateBuilderObject(document: BuilderSceneDocument, objectId: string) {
  if (document.objects.length >= 16) return document
  const source = document.objects.find(object => object.id === objectId)
  if (!source) return document
  const number = nextObjectNumber(document.objects)
  const copy = structuredClone(source)
  copy.id = `object-${number}`
  copy.name = `${source.name} copy`.slice(0, 80)
  return { ...document, objects: [...document.objects, copy] }
}

export function removeBuilderObject(document: BuilderSceneDocument, objectId: string) {
  return { ...document, objects: document.objects.filter(object => object.id !== objectId) }
}
