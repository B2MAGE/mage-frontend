import { EDITOR_SECTIONS } from '../fixtures'
import type { EditorSectionConfig, EditorSectionId } from '../types'

type SceneEditorStepperProps = {
  currentSection: EditorSectionConfig
  currentSectionIndex: number
  sectionIssuesById: Partial<Record<EditorSectionId, string | null>>
  onSectionJump: (sectionId: EditorSectionId) => void
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m9.55 16.65-4.2-4.2 1.4-1.4 2.8 2.8 7.65-7.65 1.4 1.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M11 6h2v8h-2zm0 10h2v2h-2z" fill="currentColor" />
    </svg>
  )
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
                title={isInvalid ? issueMessage ?? undefined : undefined}
                type="button"
              >
                <span className="scene-editor-stepper__label">{section.title}</span>
                <span aria-hidden="true" className="scene-editor-stepper__marker">
                  {isInvalid ? <AlertIcon /> : isComplete ? <CheckIcon /> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
