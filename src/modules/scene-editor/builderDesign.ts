import type { BuilderSceneDocument } from '@modules/player'

/** A reusable design has no scene-wide camera, effects, audio, environment, or scale. */
export type BuilderDesign = Pick<BuilderSceneDocument,
  'schemaVersion' | 'kind' | 'builderVersion' | 'objects' | 'composition' | 'rendering'>

function designFields(document: BuilderDesign): BuilderDesign {
  return { schemaVersion: document.schemaVersion, kind: document.kind, builderVersion: document.builderVersion,
    objects: document.objects,
    ...(document.composition ? { composition: document.composition } : {}),
    ...(document.rendering ? { rendering: document.rendering } : {}) }
}

export function builderDesign(document: BuilderDesign): BuilderDesign {
  return structuredClone(designFields(document))
}

export function builderDesignKey(document: BuilderDesign) {
  return JSON.stringify(designFields(document))
}
