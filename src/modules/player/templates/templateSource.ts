import { parseSceneDocument, SceneContractError, type CustomSceneDocument, type TemplateSceneDocument } from './sceneContract'
import { resolveSceneForPlayback } from './resolveScene'
import { getTemplateDefinition } from './templateRegistry'

/** Read platform-authored text for the editor without compiling or executing it. */
export function readTemplateShaderSource(document: Pick<TemplateSceneDocument, 'templateId' | 'templateVersion'>): string {
  const definition = getTemplateDefinition(document.templateId, document.templateVersion)
  if (!definition) throw new SceneContractError('Unknown template ID or version.')
  return definition.shader
}

/** Copy the exact template appearance into an explicitly untrusted custom document. */
export function createCustomSceneFromTemplate(document: TemplateSceneDocument, shader: string): CustomSceneDocument {
  const resolved = resolveSceneForPlayback(document)
  if (resolved.kind !== 'template') throw new SceneContractError('A template scene is required.')
  const scene = resolved.engineScene
  return parseSceneDocument({ schemaVersion: 1, kind: 'custom', scene: {
    ...scene, visualizer: { ...(scene.visualizer as Record<string, unknown>), shader },
  } }) as CustomSceneDocument
}
