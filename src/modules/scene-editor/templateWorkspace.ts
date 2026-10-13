import { parseSceneDocument, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { isBuilderEditorDocument } from './builderEditor'
import { BUILDER_RECIPES, createBuilderRecipe } from './builderRecipes'
import { getSceneEditorModel, type SceneData } from './sceneEditor'
import { changeAuthoredBranch, changeAuthoredMusicSettings, createTemplateScene, isTemplateEditorDocument } from './templateEditor'
import { builderDesign, builderDesignKey, type BuilderDesign } from './builderDesign'

const recipeIds = new Set<string>(BUILDER_RECIPES.map(recipe => recipe.templateId))

/** Saved Builder documents have no template metadata. Existing recipe IDs are only a label hint. */
function inferBuilderTemplate(document: BuilderSceneDocument): TemplateId | null {
  const sources = new Set<string>()
  for (const node of [...document.objects, ...(document.composition?.groups ?? [])]) {
    const match = /^recipe-(\d+)-/.exec(node.id)
    if (match) sources.add(`embedded-scene-${match[1]}`)
  }
  const [source] = sources
  return sources.size === 1 && recipeIds.has(source) ? source as TemplateId : null
}

/** Convert catalog templates when opened; never regenerate an existing authored Builder scene. */
export function openTemplateWorkspace(document: SceneData): {
  document: SceneData
  templateSourceId: TemplateId | null
} {
  if (isTemplateEditorDocument(document)) {
    return {
      document: recipeIds.has(document.templateId)
        ? { ...createBuilderRecipe(document.templateId), settings: structuredClone(document.settings),
          parameters: structuredClone(document.parameters) }
        : document,
      templateSourceId: document.templateId,
    }
  }
  return { document, templateSourceId: isBuilderEditorDocument(document) ? inferBuilderTemplate(document) : null }
}

/** Replace only Builder-owned content; every other editor section keeps its current values. */
export function applyBuilderDesign(design: BuilderDesign, current: SceneData): BuilderSceneDocument {
  const validated = parseSceneDocument(design)
  if (validated.kind !== 'builder') throw new Error('This template is not a supported Builder design.')
  if (isBuilderEditorDocument(current) || isTemplateEditorDocument(current)) {
    return { ...builderDesign(validated), settings: structuredClone(current.settings), parameters: structuredClone(current.parameters) }
  }
  // The owner repair editor uses the same controls, expressed through the custom scene model.
  const model = getSceneEditorModel(current)
  let settings = createTemplateScene()
  for (const branch of ['controls', 'visualizer', 'intent', 'state', 'fx'] as const) {
    settings = changeAuthoredBranch(settings, branch, model[branch])
  }
  settings = changeAuthoredMusicSettings(settings, current)
  return { ...builderDesign(validated), settings: settings.settings, parameters: settings.parameters }
}

/** Effects, camera, music, and scene-wide size are scene settings, not changes to the template's objects. */
export function builderWorkspaceAdapted(document: BuilderSceneDocument, templateSourceId: TemplateId | null) {
  if (!templateSourceId || !recipeIds.has(templateSourceId)) return false
  const original = createBuilderRecipe(templateSourceId)
  return builderDesignKey(document) !== builderDesignKey(original)
}
