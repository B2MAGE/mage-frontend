import { describe, expect, it } from 'vitest'
import { changeSceneBranch } from './draftCommands'
import { createBuilderScene } from './builderEditor'
import { createTemplateScene } from './templateEditor'
import { createDefaultSceneData } from './sceneEditor'

describe('pure scene draft commands', () => {
  it.each([createTemplateScene(), createBuilderScene(), createDefaultSceneData()])(
    'updates camera settings without mutating the source or its document kind', document => {
      const original = structuredClone(document)
      const changed = changeSceneBranch(document, 'intent', intent => {
        intent.fov = 85
        return intent
      })
      expect(document).toEqual(original)
      expect(changed.kind).toBe(document.kind)
      expect(changed === document).toBe(false)
      if (changed.kind === 'template' || changed.kind === 'builder') {
        expect(changed).toMatchObject({ settings: { camera: { fov: 85 } } })
      } else expect(changed).toMatchObject({ intent: { fov: 85 } })
    },
  )
})
