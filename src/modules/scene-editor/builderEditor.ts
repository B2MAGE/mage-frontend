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

export const BUILDER_EXPANDED_PRIMITIVE_LIMIT = 16

export function builderObjectExpandedCount(object: BuilderObject) {
  return object.arrangements.reduce((count, arrangement) => count * arrangement.count, 1)
}

export function builderSceneExpandedCount(document: BuilderSceneDocument) {
  return document.objects.reduce((count, object) => count + builderObjectExpandedCount(object), 0)
}

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

type BuilderStartingStyle = Readonly<{
  colors: readonly string[]
  metalness: number
  shininess: number
}>

const BUILDER_STARTING_STYLES = {
  'embedded-scene-0': { colors: ['#8066ff', '#55d6ff', '#f4f0ff'], metalness: 0.5, shininess: 0.8 },
  'embedded-scene-1': { colors: ['#6e7e7b', '#b5c2bf', '#3a4543'], metalness: 0.59, shininess: 0.67 },
  'embedded-scene-2': { colors: ['#15c7c3', '#6bf3dd', '#0d7186'], metalness: 0.57, shininess: 0.37 },
  'embedded-scene-3': { colors: ['#267910', '#70d45a', '#b5ff80'], metalness: 0.64, shininess: 0.34 },
  'embedded-scene-4': { colors: ['#e42743', '#ff7a5c', '#8d1027'], metalness: 0.51, shininess: 0.48 },
  'embedded-scene-5': { colors: ['#3d4437', '#9da89a', '#d8dfd3'], metalness: 0.63, shininess: 0.62 },
  'embedded-scene-6': { colors: ['#f31b00', '#ff8a00', '#6b0800'], metalness: 0.55, shininess: 0.5 },
  'embedded-scene-7': { colors: ['#1d0277', '#6d45ff', '#bf77ff'], metalness: 0.57, shininess: 0.56 },
  'embedded-scene-8': { colors: ['#67c673', '#b5f7ae', '#2a7668'], metalness: 0.66, shininess: 0.66 },
  'embedded-scene-9': { colors: ['#ff4d00', '#ffb13b', '#8c1e00'], metalness: 0.48, shininess: 0.49 },
  'embedded-scene-10': { colors: ['#32e93f', '#a7ff62', '#087f42'], metalness: 0.32, shininess: 0.38 },
  'embedded-scene-11': { colors: ['#55aaff', '#ff5bd6', '#58ffd5'], metalness: 0.1, shininess: 0.6 },
  'embedded-scene-12': { colors: ['#ff5bd6', '#6b5cff', '#40e8ff'], metalness: 0.2, shininess: 0.7 },
  'embedded-scene-13': { colors: ['#be3f9c', '#ff85c8', '#7235bb'], metalness: 0.64, shininess: 0.41 },
  'reaction-rings-v1': { colors: ['#7a42f2', '#14a693', '#f24d80', '#a67aff'], metalness: 0, shininess: 0.9 },
  'reaction-lantern-v1': { colors: ['#2e5cd9', '#b838d9', '#29b39f'], metalness: 0.15, shininess: 0.8 },
} satisfies Record<TemplateId, BuilderStartingStyle>

function applyStartingStyle(objects: readonly BuilderObject[], templateId: TemplateId): BuilderObject[] {
  const style = BUILDER_STARTING_STYLES[templateId]
  return objects.map((object, index) => ({
    ...object,
    material: {
      color: style.colors[index % style.colors.length],
      metalness: style.metalness,
      shininess: style.shininess,
    },
  }))
}

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
    modifiers: [],
    arrangements: [],
    motion: { type: 'none' },
    bindings: [],
  }
}

export function createBuilderScene(templateId: TemplateId = 'embedded-scene-0'): BuilderSceneDocument {
  const template = createTemplateScene(templateId)
  const objects = applyStartingStyle([createBuilderObject('sphere')], templateId)
  const document = parseSceneDocument({
    schemaVersion: 1,
    kind: 'builder',
    builderVersion: 1,
    objects,
    parameters: { ...template.parameters, scale: 1 },
    settings: template.settings,
  })
  if (document.kind !== 'builder') throw new Error('A Builder scene is required.')
  return document
}

export function createBuilderSceneFromSettings(
  source: Pick<BuilderSceneDocument, 'parameters' | 'settings'>,
  templateId: TemplateId = 'embedded-scene-0',
): BuilderSceneDocument {
  const document = parseSceneDocument({
    schemaVersion: 1,
    kind: 'builder',
    builderVersion: 1,
    objects: applyStartingStyle([createBuilderObject('sphere')], templateId),
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
  return { ...document, objects: applyStartingStyle(document.objects, templateId) }
}

export function addBuilderObject(document: BuilderSceneDocument, type: BuilderShape) {
  if (document.objects.length >= 16 || builderSceneExpandedCount(document) >= BUILDER_EXPANDED_PRIMITIVE_LIMIT) return document
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
  if (!source || builderSceneExpandedCount(document) + builderObjectExpandedCount(source) > BUILDER_EXPANDED_PRIMITIVE_LIMIT) return document
  const number = nextObjectNumber(document.objects)
  const copy = structuredClone(source)
  copy.id = `object-${number}`
  copy.name = `${source.name} copy`.slice(0, 80)
  return { ...document, objects: [...document.objects, copy] }
}

export function removeBuilderObject(document: BuilderSceneDocument, objectId: string) {
  return { ...document, objects: document.objects.filter(object => object.id !== objectId) }
}
