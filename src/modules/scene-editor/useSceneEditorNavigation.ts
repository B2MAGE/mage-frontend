import { useState } from 'react'
import { EDITOR_SECTIONS } from './fixtures'
import type { EditorSectionId } from './types'

export function useSceneEditorNavigation() {
  const [sectionMenuValue, setSectionMenuValue] = useState<EditorSectionId>('details')
  const currentSectionIndex = Math.max(
    0,
    EDITOR_SECTIONS.findIndex((section) => section.id === sectionMenuValue),
  )
  const currentSection = EDITOR_SECTIONS[currentSectionIndex] ?? EDITOR_SECTIONS[0]
  const previousSection =
    currentSectionIndex > 0 ? EDITOR_SECTIONS[currentSectionIndex - 1] : null
  const nextSection =
    currentSectionIndex < EDITOR_SECTIONS.length - 1
      ? EDITOR_SECTIONS[currentSectionIndex + 1]
      : null

  function handleSectionJump(nextSectionId: EditorSectionId) {
    setSectionMenuValue(nextSectionId)
  }

  function handleSectionStep(direction: -1 | 1) {
    const nextIndex = currentSectionIndex + direction
    const nextSectionConfig = EDITOR_SECTIONS[nextIndex]

    if (!nextSectionConfig) {
      return
    }

    handleSectionJump(nextSectionConfig.id)
  }

  return {
    currentSection,
    currentSectionIndex,
    handleSectionJump,
    handleSectionStep,
    nextSection,
    previousSection,
    sectionMenuValue,
  }
}
