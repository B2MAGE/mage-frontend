import { EDITOR_SECTIONS } from '../fixtures'
import type { EditorSectionConfig } from '../types'

type SceneEditorActionBarProps = {
  currentSection: EditorSectionConfig
  currentSectionIndex: number
  isActionBarStuck: boolean
  isSubmitting: boolean
  nextSection: EditorSectionConfig | null
  pendingTagAttachment: { sceneId: number; tagIds: number[] } | null
  previousSection: EditorSectionConfig | null
  submitLabel?: string
  submittingLabel?: string
  onSectionStep: (direction: -1 | 1) => void
}

export function SceneEditorActionBar({
  currentSection,
  currentSectionIndex,
  isActionBarStuck,
  isSubmitting,
  nextSection,
  pendingTagAttachment,
  previousSection,
  submitLabel = 'Create scene',
  submittingLabel = 'Creating scene...',
  onSectionStep,
}: SceneEditorActionBarProps) {
  return (
    <div
      className={
        isActionBarStuck
          ? 'scene-editor-action-bar scene-editor-action-bar--stuck'
          : 'scene-editor-action-bar'
      }
    >
      <div className="scene-editor-action-bar__meta">
        <span className="scene-editor-toolbar__eyebrow">Section</span>
        <strong>{currentSection.title}</strong>
        <span>
          {currentSectionIndex + 1} of {EDITOR_SECTIONS.length}
        </span>
      </div>

      <div className="scene-editor-action-bar__buttons">
        <button
          className="scene-secondary-button scene-editor-nav-button"
          disabled={!previousSection || isSubmitting}
          onClick={() => onSectionStep(-1)}
          type="button"
        >
          Back
        </button>

        <button
          className="scene-secondary-button scene-editor-nav-button"
          disabled={!nextSection || isSubmitting}
          onClick={() => onSectionStep(1)}
          type="button"
        >
          Next
        </button>

        <button className="demo-link auth-submit scene-editor-submit" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? pendingTagAttachment
              ? 'Retrying tag attachment...'
              : submittingLabel
            : pendingTagAttachment
              ? 'Retry tag attachment'
              : submitLabel}
        </button>
      </div>
    </div>
  )
}
