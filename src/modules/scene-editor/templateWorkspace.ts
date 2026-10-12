import type { BuilderSceneDocument, TemplateId } from '@modules/player'
import { isBuilderEditorDocument } from './builderEditor'
import { BUILDER_RECIPES, createBuilderRecipe } from './builderRecipes'
import type { SceneData } from './sceneEditor'
import { isTemplateEditorDocument } from './templateEditor'

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

function builderContent(document: BuilderSceneDocument) {
  return JSON.stringify([document.objects, document.composition, document.rendering])
}

/** Effects, camera, music, and scene-wide size are scene settings, not changes to the template's objects. */
export function builderWorkspaceAdapted(document: BuilderSceneDocument, templateSourceId: TemplateId | null) {
  if (!templateSourceId || !recipeIds.has(templateSourceId)) return false
  const original = createBuilderRecipe(templateSourceId)
  return builderContent(document) !== builderContent(original)
}
