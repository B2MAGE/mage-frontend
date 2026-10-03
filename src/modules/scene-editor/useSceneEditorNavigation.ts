import { useCallback, useState } from 'react'
import { EDITOR_SECTIONS } from './fixtures'
import type { EditorSectionConfig, EditorSectionId } from './types'

export function useSceneEditorNavigation(sections: readonly EditorSectionConfig[] = EDITOR_SECTIONS) {
  const [sectionMenuValue, setSectionMenuValue] = useState<EditorSectionId>('details')
  const visibleSection = sections.some(section => section.id === sectionMenuValue) ? sectionMenuValue : 'scene'
  const currentSectionIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === visibleSection),
  )
  const currentSection = sections[currentSectionIndex] ?? EDITOR_SECTIONS[0]

  const handleSectionJump = useCallback((nextSectionId: EditorSectionId) => {
    setSectionMenuValue(nextSectionId)
  }, [])

  return {
    currentSection,
    currentSectionIndex,
    handleSectionJump,
    sectionMenuValue: currentSection.id,
  }
}
