import { useRef } from 'react'
import type { BuilderObject, BuilderSceneDocument } from '@modules/player'
import { addBuilderObject, duplicateBuilderObject, isBuilderEditorDocument, moveBuilderObject,
  removeBuilderObject, updateBuilderObject, type BuilderShape } from './builderEditor'
import type { SceneData } from './sceneEditor'

type Args = {
  readDraft: () => SceneData
  applyDraft: (next: SceneData, replaceRawDraft?: boolean, changedField?: string | string[]) => void
}

/** UI commands identify their target by ID and leave transformation to pure helpers. */
export function useSceneDraftCommands({ readDraft, applyDraft }: Args) {
  const assignedIds = useRef(new Set<string>())
  function nextObjectId(document: BuilderSceneDocument) {
    for (const object of document.objects) assignedIds.current.add(object.id)
    let number = 1
    while (assignedIds.current.has(`object-${number}`)) number += 1
    const id = `object-${number}`
    assignedIds.current.add(id)
    return id
  }
  function editObjects(command: (document: BuilderSceneDocument) => BuilderSceneDocument) {
    const document = readDraft()
    if (!isBuilderEditorDocument(document)) return
    for (const object of document.objects) assignedIds.current.add(object.id)
    const next = command(document)
    if (next !== document) applyDraft(next, false, 'objects')
  }
  return {
    handleAddBuilderObject: (shape: BuilderShape) => editObjects(document => addBuilderObject(document, shape, nextObjectId(document))),
    handleDuplicateBuilderObject: (id: string) => editObjects(document => duplicateBuilderObject(document, id, nextObjectId(document))),
    handleRemoveBuilderObject: (id: string) => editObjects(document => removeBuilderObject(document, id)),
    handleMoveBuilderObject: (id: string, targetId: string) => editObjects(document => moveBuilderObject(document, id, targetId)),
    handleUpdateBuilderObject: (id: string, recipe: (object: BuilderObject) => BuilderObject) =>
      editObjects(document => updateBuilderObject(document, id, recipe)),
  }
}
