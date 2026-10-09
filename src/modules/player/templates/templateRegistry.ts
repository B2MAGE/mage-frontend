import { TEMPLATE_DEFINITIONS_V1 } from './versions/v1/definitions'

export type SceneTemplate = Readonly<{
  templateId: string
  templateVersion: number
  label: string
  description: string
}>

/** Internal to the player boundary. Source is never accepted from template data. */
export type TemplateDefinition = Readonly<SceneTemplate & { shader: string }>

const definitions: readonly TemplateDefinition[] = Object.freeze([
  ...TEMPLATE_DEFINITIONS_V1,
])

const catalog: readonly SceneTemplate[] = Object.freeze(definitions.map((definition) => Object.freeze({
  templateId: definition.templateId,
  templateVersion: definition.templateVersion,
  label: definition.label,
  description: definition.description,
})))

/** Code-free metadata for a picker. Saved scenes must keep both ID and version. */
export const listSceneTemplates = (): readonly SceneTemplate[] => catalog

/** Templates offered for new scenes use the same supported catalog as playback. */
export const listSelectableSceneTemplates = (): readonly SceneTemplate[] => catalog

/** Exact lookup only: unknown versions must never silently resolve to newer code. */
export const getTemplateDefinition = (
  templateId: string,
  templateVersion: number,
): TemplateDefinition | undefined => definitions.find((definition) => (
  definition.templateId === templateId && definition.templateVersion === templateVersion
))
