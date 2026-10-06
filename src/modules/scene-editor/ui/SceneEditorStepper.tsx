import { useEffect, useRef, type KeyboardEvent } from 'react'
import { EDITOR_SECTIONS } from '../fixtures'
import { AppIcon } from '@shared/ui'
import type { EditorSectionConfig, EditorSectionId } from '../types'

type SceneEditorStepperProps = {
  sections?: readonly EditorSectionConfig[]
  currentSection: EditorSectionConfig
  currentSectionIndex: number
  sectionIssuesById: Partial<Record<EditorSectionId, string | null>>
  onSectionJump: (sectionId: EditorSectionId) => void
}

export function SceneEditorStepper({
  sections = EDITOR_SECTIONS,
  currentSection,
  currentSectionIndex,
  sectionIssuesById,
  onSectionJump,
}: SceneEditorStepperProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => {
    buttonRefs.current[currentSectionIndex]?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [currentSectionIndex])

  function handleStepKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % sections.length
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + sections.length) % sections.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = sections.length - 1
    }

    if (nextIndex === null) return
    event.preventDefault()
    const nextSection = sections[nextIndex]
    buttonRefs.current[nextIndex]?.focus()
    onSectionJump(nextSection.id)
  }

  return (
    <nav aria-label="Section navigation" className="scene-editor-stepper">
      <ol className="scene-editor-stepper__list">
        {sections.map((section, index) => {
          const isActive = section.id === currentSection.id
          const isPrevious = index < currentSectionIndex
          const issueMessage = sectionIssuesById[section.id]
          const hasIssues = Boolean(issueMessage)
          const isInvalid = isPrevious && hasIssues
          const isComplete = isPrevious && !hasIssues
          const status = isActive
            ? 'current'
            : isInvalid
              ? 'warning'
              : isComplete
                ? 'complete'
                : 'not-yet-complete'
          const statusDescription = isActive
            ? `Current step.${hasIssues ? ` Needs attention: ${issueMessage}` : ''}`
            : isInvalid
              ? `Needs attention: ${issueMessage}`
              : isComplete
                ? 'Complete.'
                : 'Not yet complete.'
          const statusId = `scene-editor-step-${section.id}-status`
          const className = [
            'scene-editor-stepper__button',
            isActive ? 'scene-editor-stepper__button--active' : '',
            isInvalid ? 'scene-editor-stepper__button--invalid' : '',
            isComplete ? 'scene-editor-stepper__button--complete' : '',
          ].filter(Boolean).join(' ')

          return (
            <li className="scene-editor-stepper__item" key={section.id}>
              <button
                aria-describedby={statusId}
                aria-label={section.title}
                aria-current={isActive ? 'step' : undefined}
                className={className}
                data-step-status={status}
                onClick={() => onSectionJump(section.id)}
                onKeyDown={event => handleStepKeyDown(event, index)}
                ref={element => { buttonRefs.current[index] = element }}
                title={isInvalid ? issueMessage ?? section.title : section.title}
                type="button"
              >
                <span aria-hidden="true" className="scene-editor-stepper__number">{index + 1}</span>
                <span className="scene-editor-stepper__label">{section.title}</span>
                <span aria-hidden="true" className="scene-editor-stepper__marker">
                  {isInvalid ? <AppIcon name="circle-alert" /> : isComplete ? <AppIcon name="check" /> : null}
                </span>
                <span className="scene-editor-stepper__status" id={statusId}>{statusDescription}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
