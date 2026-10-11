import { useRef, useState } from 'react'
import { assertSceneDocumentBudget, type BuilderGroup, type BuilderObject, type BuilderSceneDocument } from '@modules/player'
import { addBuilderObject, isBuilderEditorDocument, moveBuilderObject,
  removeBuilderObject, updateBuilderObject, type BuilderShape } from './builderEditor'
import { builderOrderedNodes, duplicateBuilderNode, groupBuilderNodes, reparentBuilderNode, ungroupBuilderNode, updateBuilderGroup } from './builderGroups'
import type { SceneData } from './sceneEditor'

type Args = {
  readDraft: () => SceneData
  applyDraft: (next: SceneData, replaceRawDraft?: boolean, changedField?: string | string[]) => void
}

/** UI commands identify their target by ID and leave transformation to pure helpers. */
export function useSceneDraftCommands({ readDraft, applyDraft }: Args) {
  const assignedIds = useRef(new Set<string>())
  const [builderCommandError, setBuilderCommandError] = useState<string | null>(null)
  function nextNodeId(document: BuilderSceneDocument, kind: 'object' | 'group' = 'object') {
    for (const object of builderOrderedNodes(document)) assignedIds.current.add(object.id)
    let number = 1
    while (assignedIds.current.has(`${kind}-${number}`)) number += 1
    const id = `${kind}-${number}`
    assignedIds.current.add(id)
    return id
  }
  function editObjects(command: (document: BuilderSceneDocument) => BuilderSceneDocument) {
    const document = readDraft()
    if (!isBuilderEditorDocument(document)) return
    for (const object of builderOrderedNodes(document)) assignedIds.current.add(object.id)
    try {
      const next = command(document)
      if (next !== document) {
        try { assertSceneDocumentBudget(next) }
        catch { throw new Error('This change would exceed the scene size limit. Remove an object or simplify the scene, then try again.') }
      }
      setBuilderCommandError(null)
      if (next !== document) applyDraft(next, false, ['objects', 'composition'])
    } catch (error) {
      setBuilderCommandError(error instanceof Error ? error.message : 'This group change could not be applied.')
    }
  }
  return {
    builderCommandError,
    handleAddBuilderObject: (shape: BuilderShape) => editObjects(document => addBuilderObject(document, shape, nextNodeId(document))),
    handleDuplicateBuilderObject: (id: string) => editObjects(document => duplicateBuilderNode(document, id, kind => nextNodeId(document, kind))),
    handleRemoveBuilderObject: (id: string) => editObjects(document => removeBuilderObject(document, id)),
    handleMoveBuilderObject: (id: string, targetId: string) => editObjects(document => moveBuilderObject(document, id, targetId)),
    handleUpdateBuilderObject: (id: string, recipe: (object: BuilderObject) => BuilderObject) =>
      editObjects(document => updateBuilderObject(document, id, recipe)),
    handleGroupBuilderNodes: (ids: string[]) => editObjects(document => groupBuilderNodes(document, ids, nextNodeId(document, 'group'))),
    handleUngroupBuilderNode: (id: string) => editObjects(document => ungroupBuilderNode(document, id)),
    handleReparentBuilderNode: (id: string, parentId: string | null) => editObjects(document => reparentBuilderNode(document, id, parentId)),
    handleUpdateBuilderGroup: (id: string, recipe: (group: BuilderGroup) => BuilderGroup) =>
      editObjects(document => updateBuilderGroup(document, id, recipe)),
  }
}
