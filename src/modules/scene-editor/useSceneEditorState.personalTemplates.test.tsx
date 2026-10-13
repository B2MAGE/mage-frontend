import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { useSceneEditorState } from './useSceneEditorState'
import { buildSceneSubmissionDocument } from './utils'
import { parseSceneDraftRecord, sceneDraftFingerprint } from './sceneDraftRecovery'
import type { PersonalTemplate } from './personalTemplates'
import { builderDesign } from './builderDesign'

vi.mock('@shared/lib', async original => ({ ...await original<typeof import('@shared/lib')>(),
  fetchAvailableTags: async () => [] }))

function template(): PersonalTemplate {
  const sceneData = createBuilderScene()
  sceneData.objects[0].name = 'My sphere'
  return { templateId: 17, name: 'My constellation', sceneData: builderDesign(sceneData), revision: 2, thumbnailRef: null,
    createdAt: '', updatedAt: '' }
}
async function editor() {
  const hook = renderHook(() => useSceneEditorState({ authenticatedFetch: vi.fn(),
    initialState: { name: 'Keep my title', description: 'Keep my description', sceneData: createBuilderScene() } }))
  await waitFor(() => expect(hook.result.current.tagsLoading).toBe(false))
  return hook
}

describe('personal template copies in editor history', () => {
  it('loads an independent design, retains other settings and details, and undoes source and design together', async () => {
    const { result } = await editor()
    act(() => result.current.updateBuilderValue('settings.camera.fov', 73))
    act(() => result.current.updateBuilderValue('settings.skybox', 3))
    act(() => result.current.updateBuilderValue('parameters.speed', 1.8))
    const original = result.current.builderDocument!
    const saved = template()
    act(() => result.current.handleLoadPersonalTemplate(saved))
    expect(builderDesign(result.current.builderDocument!)).toEqual(saved.sceneData)
    expect(result.current.builderDocument?.settings).toEqual(original.settings)
    expect(result.current.builderDocument?.parameters).toEqual(original.parameters)
    expect(result.current.sceneData).not.toBe(saved.sceneData)
    expect(result.current.name).toBe('Keep my title')
    expect(result.current.description).toBe('Keep my description')
    expect(result.current.personalTemplateSource).toMatchObject({ templateId: 17, revision: 2 })
    saved.sceneData.objects[0].name = 'Library changed later'
    expect(result.current.builderDocument?.objects[0].name).toBe('My sphere')
    act(() => result.current.undoDraft())
    expect(result.current.sceneData).toEqual(original)
    expect(result.current.personalTemplateSource).toBeNull()
    act(() => result.current.redoDraft())
    expect(result.current.personalTemplateSource?.templateId).toBe(17)
    expect(result.current.isPersonalTemplateAdapted).toBe(false)
    act(() => result.current.updateBuilderValue('settings.camera.fov', 91))
    expect(result.current.isPersonalTemplateAdapted).toBe(false)
    act(() => result.current.handleUpdateBuilderObject(result.current.builderDocument!.objects[0].id,
      object => ({ ...object, name: 'My changed design' })))
    expect(result.current.isPersonalTemplateAdapted).toBe(true)
  })

  it('recovers personal source context without putting any library reference into a saved scene', async () => {
    const { result } = await editor()
    act(() => result.current.updateBuilderValue('settings.camera.fov', 73))
    act(() => result.current.handleLoadPersonalTemplate(template()))
    const snapshot = result.current.draftSnapshot
    const recovered = parseSceneDraftRecord(JSON.stringify({ version: 1, savedAt: 123,
      baseFingerprint: sceneDraftFingerprint(snapshot), snapshot,
      saveContext: { savedSceneId: null, expectedRevision: null, saveNeedsReview: false } }))!
    act(() => result.current.handleTemplateSelection('embedded-scene-5'))
    expect(result.current.personalTemplateSource).toBeNull()
    act(() => result.current.restoreDraft(recovered.snapshot))
    expect(result.current.personalTemplateSource?.revision).toBe(2)
    expect(result.current.builderTemplateSourceId).toBeNull()
    const submission = buildSceneSubmissionDocument(result.current.sceneData)
    expect(submission).not.toHaveProperty('personalTemplateSource')
    expect(submission).not.toHaveProperty('templateSourceId')
    expect(submission).not.toHaveProperty('name')
    expect(submission).toMatchObject({ settings: { camera: { fov: 73 } } })
  })

  it('does not replace newer edits or their source when an older library save completes', async () => {
    const { result } = await editor()
    const submitted = result.current.builderDocument!
    act(() => result.current.updateBuilderValue('settings.camera.fov', 91))
    act(() => result.current.handlePersonalTemplateSaved(template(), submitted))
    expect(result.current.personalTemplateSource).toBeNull()
    expect(result.current.builderDocument?.settings.camera.fov).toBe(91)
    const latest = result.current.builderDocument!
    act(() => result.current.handlePersonalTemplateSaved(template(), latest))
    expect(result.current.personalTemplateSource?.revision).toBe(2)
    expect(result.current.isPersonalTemplateAdapted).toBe(false)
    act(() => result.current.undoDraft())
    expect(result.current.builderDocument?.settings.camera.fov).toBe(submitted.settings.camera.fov)
  })
})
