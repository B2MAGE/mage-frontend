import type { PersistedPassFlag, SceneData, SceneEditorModel, ScenePassId } from './sceneEditor'

export type CreateSceneFormErrors = Partial<
  Record<'description' | 'form' | 'name' | 'newTag' | 'sceneData' | 'tags' | 'thumbnail', string>
>

export type EditorSectionId =
  | 'confirm'
  | 'details'
  | 'camera'
  | 'effects'
  | 'motion'
  | 'pass-order'
  | 'scene'

export type EffectCategoryId = 'color' | 'finish' | 'pattern' | 'trail'

export type PendingTagAttachment = {
  sceneId: number
  tagIds: number[]
}

export type TagAttachmentFailure = {
  tagId: number
  tagName: string
}

export type AdditionalPassConfig = {
  category: EffectCategoryId
  description: string
  flag: PersistedPassFlag
  passId: ScenePassId
}

export type EditorSectionConfig = {
  id: EditorSectionId
  title: string
}

export type SceneEditorStateSnapshot = {
  availableTags: Array<{ tagId: number; name: string }>
  description: string
  isCameraAdvancedEnabled: boolean
  isMotionAdvancedEnabled: boolean
  name: string
  pendingTagAttachment: PendingTagAttachment | null
  sceneData: SceneData
  sceneDataText: string
  selectedTagIds: number[]
  tagsError: string | null
  tagsLoading: boolean
  thumbnailFile: File | null
}

export type SceneEditorInitialState = {
  description?: string | null
  name?: string
  sceneData?: SceneData
  tagNames?: string[]
  thumbnailPreviewUrl?: string | null
}

export type SceneEditorSubmissionMode =
  | {
      type: 'create'
    }
  | {
      sceneId: number
      type: 'edit'
    }

export type SceneEditorStateBranchUpdater = <K extends keyof SceneEditorModel>(
  branch: K,
  recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
) => void
