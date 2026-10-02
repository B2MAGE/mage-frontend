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

  function handleSectionJump(nextSectionId: EditorSectionId) {
    setSectionMenuValue(nextSectionId)
  }

  return {
    currentSection,
    currentSectionIndex,
    handleSectionJump,
    sectionMenuValue,
  }
}
