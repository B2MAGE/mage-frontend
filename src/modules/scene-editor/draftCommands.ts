import { getSceneEditorModel, type SceneData, type SceneEditorModel } from './sceneEditor'
import { changeTemplateBranch, getTemplateEditorModel, isTemplateEditorDocument } from './templateEditor'
import { changeBuilderBranch, getBuilderEditorModel, isBuilderEditorDocument } from './builderEditor'

/** Apply only the user's changed fields, retaining unsupported repair values. */
export function mergeChangedValues(original: unknown, before: unknown, after: unknown): unknown {
  if (before === after) return original
  if (original && before && after && typeof original === 'object' && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(original) && !Array.isArray(before) && !Array.isArray(after)) {
    const next = { ...original } as Record<string, unknown>
    for (const [key, value] of Object.entries(after)) {
      const previous = (before as Record<string, unknown>)[key]
      if (previous !== value) next[key] = mergeChangedValues(next[key], previous, value)
    }
    return next
  }
  return after
}

/** Pure control edits retain unrelated draft values and the selected document kind. */
export function changeSceneBranch<K extends keyof SceneEditorModel>(
  document: SceneData, branch: K, recipe: (current: SceneEditorModel[K]) => SceneEditorModel[K],
): SceneData {
  const model = isTemplateEditorDocument(document) ? getTemplateEditorModel(document)
    : isBuilderEditorDocument(document) ? getBuilderEditorModel(document) : getSceneEditorModel(document)
  const next = recipe(structuredClone(model[branch]))
  if (isTemplateEditorDocument(document)) return changeTemplateBranch(document, branch, next)
  if (isBuilderEditorDocument(document)) return changeBuilderBranch(document, branch, next)
  return { ...document, [branch]: mergeChangedValues(document[branch], model[branch], next) }
}
