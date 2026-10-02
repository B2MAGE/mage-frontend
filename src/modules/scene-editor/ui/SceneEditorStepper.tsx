import { EDITOR_SECTIONS } from '../fixtures'
import { AppIcon } from '@shared/ui'
import type { EditorSectionConfig, EditorSectionId } from '../types'

type SceneEditorStepperProps = {
  currentSection: EditorSectionConfig
  currentSectionIndex: number
  sectionIssuesById: Partial<Record<EditorSectionId, string | null>>
  onSectionJump: (sectionId: EditorSectionId) => void
}

export function SceneEditorStepper({
  currentSection,
  currentSectionIndex,
  sectionIssuesById,
  onSectionJump,
}: SceneEditorStepperProps) {
  return (
    <nav aria-label="Section navigation" className="scene-editor-stepper">
      <ol className="scene-editor-stepper__list">
        {EDITOR_SECTIONS.map((section, index) => {
          const isActive = section.id === currentSection.id
          const isPrevious = index < currentSectionIndex
          const issueMessage = sectionIssuesById[section.id]
          const hasIssues = Boolean(issueMessage)
          const isInvalid = isPrevious && hasIssues
          const isComplete = isPrevious && !hasIssues

          return (
            <li className="scene-editor-stepper__item" key={section.id}>
              <button
                aria-label={section.title}
                aria-current={isActive ? 'step' : undefined}
                className={
                  isActive
                    ? 'scene-editor-stepper__button scene-editor-stepper__button--active'
                    : isInvalid
                      ? 'scene-editor-stepper__button scene-editor-stepper__button--invalid'
                      : isComplete
                        ? 'scene-editor-stepper__button scene-editor-stepper__button--complete'
                        : 'scene-editor-stepper__button'
                }
                onClick={() => onSectionJump(section.id)}
                title={isInvalid ? issueMessage ?? section.title : section.title}
                type="button"
              >
                <span aria-hidden="true" className="scene-editor-stepper__number">{index + 1}</span>
                <span className="scene-editor-stepper__label">{section.title}</span>
                <span aria-hidden="true" className="scene-editor-stepper__marker">
                  {isInvalid ? <AppIcon name="circle-alert" /> : isComplete ? <AppIcon name="check" /> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
