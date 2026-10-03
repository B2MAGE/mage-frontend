import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'
import { useSceneEditorState } from './useSceneEditorState'
import { useSceneEditorPreview } from './useSceneEditorPreview'
import type { SceneEditorInitialState } from './types'

vi.mock('@shared/lib', async original => ({
  ...await original<typeof import('@shared/lib')>(),
  fetchAvailableTags: async () => [{ tagId: 3, name: 'ambient' }],
}))

async function state(initialState?: SceneEditorInitialState) {
  const hook = renderHook(() => useSceneEditorState({ authenticatedFetch: vi.fn(), initialState }))
  await waitFor(() => expect(hook.result.current.tagsLoading).toBe(false))
  return hook
}

describe('template editor state and preview', () => {
  it('starts basic and keeps unsupported custom controls out of the document', async () => {
    const { result } = await state()
    expect(result.current.isTemplate).toBe(true)
    expect(result.current.sceneData).toEqual(createTemplateScene())
    expect(result.current.editorSections.map(section => section.id)).toEqual(['details', 'scene', 'camera', 'motion', 'effects', 'confirm'])
    act(() => result.current.updateBranch('visualizer', branch => ({ ...branch, shader: 'sphere(50)' })))
    act(() => result.current.handleShaderSelection('embedded-scene-1'))
    act(() => result.current.handleAudioResponseModeChange('legacy'))
    act(() => result.current.handleAudioResponseReset())
    expect(result.current.sceneData).toEqual(createTemplateScene())
    act(() => result.current.updateTemplateValue('parameters.scale', 15))
    expect(result.current.templateDocument?.parameters.scale).toBe(15)
    expect(JSON.parse(result.current.sceneDataText)).toEqual(result.current.sceneData)
  })

  it('replaces custom settings only after acceptance and keeps details, tags, and thumbnail', async () => {
    const custom = { ...createDefaultSceneData(), intent: { fov: 120, time_multiplier: 4 } }
    const { result } = await state({ sceneData: custom, name: 'My scene', description: 'Keep this', tagNames: ['ambient'], thumbnailPreviewUrl: '/saved.png' })
    expect(result.current.isTemplate).toBe(false)
    act(() => result.current.handleSectionJump('pass-order'))
    act(() => result.current.handleTemplateSelection('embedded-scene-1'))
    expect(result.current.sceneData).toEqual(custom)
    expect(result.current.currentSection.id).toBe('pass-order')
    act(() => result.current.handleTemplateSelection('embedded-scene-1', true))
    expect(result.current.sceneData).toEqual(createTemplateScene('embedded-scene-1'))
    expect(result.current.currentSection.id).toBe('scene')
    expect(result.current.name).toBe('My scene')
    expect(result.current.description).toBe('Keep this')
    expect(result.current.selectedTagIds).toEqual([3])
    expect(result.current.thumbnailPreviewUrl).toBe('/saved.png')
  })

  it('retains invalid control values, freezes template preview, and recovers after repair', async () => {
    const { result } = await state()
    const preview = renderHook(({ sceneData }) => useSceneEditorPreview({ sceneData }), { initialProps: { sceneData: result.current.sceneData } })
    expect(preview.result.current.previewSceneData).toEqual(createTemplateScene())
    act(() => result.current.updateTemplateValue('settings.camera.fov', 200))
    preview.rerender({ sceneData: result.current.sceneData })
    expect(result.current.templateDocument?.settings.camera.fov).toBe(200)
    expect(result.current.errors.sceneData).toBeTruthy()
    expect(result.current.templateFieldErrors['settings.camera.fov']).toBeTruthy()
    expect(preview.result.current.previewSceneData).toEqual(createTemplateScene())
    expect(preview.result.current.previewError).toBeTruthy()
    expect(preview.result.current.sceneModel.intent.fov).toBe(200)
    act(() => result.current.updateTemplateValue('settings.camera.fov', 100))
    preview.rerender({ sceneData: result.current.sceneData })
    expect(preview.result.current.previewSceneData).toEqual(result.current.sceneData)
    expect(preview.result.current.previewError).toBeNull()
    expect(result.current.errors.sceneData).toBeUndefined()
  })

  it('keeps an invalid raw draft intact when other controls are used', async () => {
    const { result } = await state()
    const draft = '{"kind":"template","schemaVersion":99}'
    act(() => result.current.handleRawSceneDataChange(draft))
    act(() => result.current.updateTemplateValue('parameters.scale', 22))
    act(() => result.current.handleTemplateSelection('embedded-scene-1'))
    expect(result.current.sceneDataText).toBe(draft)
    expect(result.current.sceneData).toEqual(createTemplateScene())
    expect(result.current.errors.form).toContain('Fix the Scene Data JSON')
  })

  it('clears only the edited server field error and keeps local feedback separate', async () => {
    const { result } = await state()
    act(() => result.current.setErrors({ fields: { 'settings.camera.fov': 'Try a smaller FOV.', 'parameters.speed': 'Try a lower speed.' } }))
    act(() => result.current.updateTemplateValue('settings.camera.fov', 100))
    expect(result.current.errors.fields).toEqual({ 'parameters.speed': 'Try a lower speed.' })
    expect(result.current.templateFieldErrors).toEqual({})
    act(() => result.current.updateTemplateValue('settings.camera.fov', 200))
    expect(result.current.templateFieldErrors['settings.camera.fov']).toBeTruthy()
    expect(result.current.errors.fields).toEqual({ 'parameters.speed': 'Try a lower speed.' })
  })

  it('requires confirmation for imported templates and cancel preserves custom source', async () => {
    const custom = { visualizer: { shader: 'sphere(0.7)' }, intent: { fov: 120 } }
    const { result } = await state({ sceneData: custom })
    const original = result.current.sceneDataText
    const imported = createTemplateScene('embedded-scene-2')
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(imported)))
    expect(result.current.isTemplate).toBe(false)
    expect(result.current.sceneData).toEqual(custom)
    expect(result.current.pendingTemplateImport).toEqual(imported)
    act(() => result.current.handleFormatJson())
    act(() => result.current.updateBranch('intent', branch => ({ ...branch, fov: 90 })))
    expect(result.current.sceneData).toEqual(custom)
    expect(result.current.pendingTemplateImport).toEqual(imported)
    act(() => result.current.cancelTemplateImport())
    expect(result.current.sceneDataText).toBe(original)
    expect(result.current.sceneData).toEqual(custom)
    expect(result.current.pendingTemplateImport).toBeNull()
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(imported)))
    act(() => result.current.confirmTemplateImport())
    expect(result.current.sceneData).toEqual(imported)
    expect(result.current.isTemplate).toBe(true)
    expect(result.current.pendingTemplateImport).toBeNull()
  })

  it('honors an explicit custom import and requires confirmation to return to basic', async () => {
    const { result } = await state()
    const custom = { schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(0.8)' } } }
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(custom)))
    expect(result.current.sceneData).toEqual(custom.scene)
    expect(result.current.isTemplate).toBe(false)
    expect(result.current.editorSections.some(section => section.id === 'pass-order')).toBe(true)
    act(() => result.current.handleTemplateSelection('embedded-scene-0'))
    expect(result.current.sceneData).toEqual(custom.scene)
  })

  it('restores exact custom text after an imported template passes through invalid edits', async () => {
    const source = { visualizer: { shader: 'sphere(0.7)' } }
    const { result } = await state({ sceneData: source })
    const original = '{ "schemaVersion": 1, "kind": "custom", "scene": { "visualizer": { "shader": "sphere(0.7)" } } }'
    act(() => result.current.handleRawSceneDataChange(original))
    const imported = JSON.stringify(createTemplateScene('embedded-scene-2'))
    act(() => result.current.handleRawSceneDataChange(imported))
    act(() => result.current.handleRawSceneDataChange(imported.slice(0, -1)))
    expect(result.current.pendingTemplateImport).toBeNull()
    expect(result.current.sceneData).toEqual(source)
    act(() => result.current.confirmTemplateImport())
    expect(result.current.isTemplate).toBe(false)
    act(() => result.current.handleRawSceneDataChange(imported))
    act(() => result.current.cancelTemplateImport())
    expect(result.current.sceneDataText).toBe(original)
    expect(result.current.sceneData).toEqual(source)

    // A later explicit custom import establishes its own cancellation baseline.
    act(() => result.current.handleRawSceneDataChange(imported))
    const replacement = '{ "visualizer": { "shader": "sphere(0.9)" } }'
    act(() => result.current.handleRawSceneDataChange(replacement))
    act(() => result.current.handleRawSceneDataChange(imported))
    act(() => result.current.cancelTemplateImport())
    expect(result.current.sceneDataText).toBe(replacement)
    expect(result.current.sceneData).toEqual(JSON.parse(replacement))
  })
})
