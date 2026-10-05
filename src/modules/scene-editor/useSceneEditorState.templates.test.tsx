import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'
import { useSceneEditorState } from './useSceneEditorState'
import { useSceneEditorPreview } from './useSceneEditorPreview'
import type { SceneEditorInitialState } from './types'
import { createCustomSceneFromTemplate, readTemplateShaderSource } from '@modules/player'
import { buildSceneSubmissionDocument } from './utils'

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
  it('converts only a shader change and preserves authored settings and scene details in the custom submission', async () => {
    const template = createTemplateScene('reaction-rings-v1')
    template.parameters = { scale: 42, speed: 2 }
    template.settings.camera.fov = 80
    template.settings.bloom.strength = 1.2
    template.settings.effects = { passes: { rgbShift: true }, params: { rgbShift: { amount: 0.02, angle: 0.3 } } }
    template.settings.audioResponse = 'mapped-v1'
    template.settings.audioResponseConfig = { version: 1, sensitivity: 0.4, mappings: [{ target: 'size', source: 'bass-hit', amount: 0.2, attack: 0.03, release: 0.4 }] }
    const { result } = await state({ sceneData: template, name: 'My scene', description: 'Keep this', tagNames: ['ambient'], thumbnailPreviewUrl: '/saved.png' })
    const source = readTemplateShaderSource(template)
    act(() => result.current.handleShaderSourceChange(source))
    expect(result.current.sceneData).toEqual(template)
    expect(buildSceneSubmissionDocument(result.current.sceneData).kind).toBe('template')
    const changedSource = `${source}\n// My change`
    act(() => result.current.handleShaderSourceChange(changedSource))
    const custom = createCustomSceneFromTemplate(template, changedSource)
    expect(result.current.isTemplate).toBe(false)
    expect(result.current.sceneData).toEqual(custom.scene)
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(custom)
    expect(JSON.parse(result.current.sceneDataText)).toEqual(custom.scene)
    expect(result.current.name).toBe('My scene')
    expect(result.current.description).toBe('Keep this')
    expect(result.current.selectedTagIds).toEqual([3])
    expect(result.current.thumbnailPreviewUrl).toBe('/saved.png')
    expect(result.current.canResetAudioResponse).toBe(false)
  })

  it('keeps invalid imported JSON and invalid template settings when shader editing is attempted', async () => {
    const { result } = await state()
    const original = result.current.sceneData
    const invalid = '{"kind":"template","schemaVersion":99}'
    act(() => result.current.handleRawSceneDataChange(invalid))
    act(() => result.current.handleShaderSourceChange('sphere(0.8)'))
    expect(result.current.sceneDataText).toBe(invalid)
    expect(result.current.sceneData).toEqual(original)
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(original)))
    act(() => result.current.updateTemplateValue('settings.camera.fov', 200))
    act(() => result.current.handleShaderSourceChange('sphere(0.8)'))
    expect(result.current.isTemplate).toBe(true)
    expect(result.current.templateDocument?.settings.camera.fov).toBe(200)
    expect(result.current.errors.form).toContain('Fix the scene settings')
  })

  it('starts basic with every safe section and prevents shader modification', async () => {
    const { result } = await state()
    expect(result.current.isTemplate).toBe(true)
    expect(result.current.sceneData).toEqual(createTemplateScene())
    expect(result.current.editorSections.map(section => section.id)).toEqual(['details', 'scene', 'camera', 'motion', 'effects', 'pass-order', 'confirm'])
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
    const custom = { ...createDefaultSceneData(), audioResponse: 'mapped-v1', intent: { fov: 120, time_multiplier: 4, minimizing_factor: 0.2 } }
    const { result } = await state({ sceneData: custom, name: 'My scene', description: 'Keep this', tagNames: ['ambient'], thumbnailPreviewUrl: '/saved.png' })
    expect(result.current.isTemplate).toBe(false)
    act(() => result.current.handleSectionJump('pass-order'))
    act(() => result.current.handleTemplateSelection('embedded-scene-1'))
    expect(result.current.sceneData).toEqual(custom)
    expect(result.current.currentSection.id).toBe('pass-order')
    act(() => result.current.handleTemplateSelection('embedded-scene-1', true))
    expect(result.current.sceneData).toEqual(createTemplateScene('embedded-scene-1'))
    expect(result.current.currentSection.id).toBe('pass-order')
    expect(result.current.name).toBe('My scene')
    expect(result.current.description).toBe('Keep this')
    expect(result.current.selectedTagIds).toEqual([3])
    expect(result.current.thumbnailPreviewUrl).toBe('/saved.png')
    expect(result.current.editorAudioResponseMode).toBe('legacy')
    expect(result.current.canResetAudioResponse).toBe(false)
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

  it('persists Basic music mappings and resets only saved music settings', async () => {
    const { result } = await state()
    act(() => result.current.updateBranch('controls', branch => ({ ...branch, zoom0: 2 })))
    act(() => result.current.updateBranch('intent', branch => ({ ...branch, time_multiplier: 2, minimizing_factor: 0.4 })))
    act(() => result.current.updateBranch('state', branch => ({ ...branch, time: 12, volume_multiplier: 0.3 })))
    act(() => result.current.handleAudioResponseModeChange('mapped-v1', ['size', 'bass']))
    expect(result.current.editorAudioResponseMode).toBe('mapped-v1')
    act(() => result.current.handleAudioResponseConfigChange({ ...result.current.editorAudioResponseConfig,
      sensitivity: 0.3, mappings: result.current.editorAudioResponseConfig.mappings.map(mapping => ({ ...mapping, amount: 0.25 })) }))
    expect(result.current.templateDocument?.settings.audioResponseConfig).toMatchObject({ sensitivity: 0.3,
      mappings: [expect.objectContaining({ target: 'size', amount: 0.25 }), expect.objectContaining({ target: 'bass', amount: 0.25 })] })
    expect(result.current.canResetAudioResponse).toBe(true)
    act(() => result.current.handleAudioResponseReset())
    expect(result.current.editorAudioResponseMode).toBe('legacy')
    expect(result.current.templateDocument?.settings).not.toHaveProperty('audioResponse')
    expect(result.current.templateDocument?.settings).not.toHaveProperty('audioResponseConfig')
    expect(result.current.templateDocument).toMatchObject({ parameters: { speed: 2 }, settings: {
      controls: { zoom0: 2 }, motion: { minimizing_factor: 0.8 }, state: { time: 12, volume_multiplier: 0 } } })
    expect(result.current.canResetAudioResponse).toBe(false)
  })

  it('updates effect order and reports extended numeric errors without changing the document mode', async () => {
    const { result } = await state()
    act(() => result.current.movePass('glitchPass', 1))
    expect(result.current.templateDocument?.settings.effects?.passOrder?.slice(0, 2)).toEqual(['bloom', 'glitchPass'])
    act(() => result.current.updateBranch('controls', branch => ({ ...branch, zoom0: 0 })))
    expect(result.current.templateFieldErrors['settings.controls.zoom0']).toBeTruthy()
    expect(result.current.templateDocument?.settings.controls?.zoom0).toBe(0)
    act(() => result.current.updateBranch('fx', branch => ({ ...branch, passes: { ...branch.passes, toon: true } })))
    expect(result.current.templateDocument?.settings.controls?.zoom0).toBe(0)
    act(() => result.current.updateBranch('controls', branch => ({ ...branch, zoom0: 1.5 })))
    expect(result.current.templateFieldErrors).toEqual({})
    expect(result.current.sceneData.kind).toBe('template')
    expect(JSON.parse(result.current.sceneDataText)).toEqual(result.current.templateDocument)
  })

  it('restores the saved template music baseline after reopening and keeps unrelated settings', async () => {
    const saved = createTemplateScene()
    saved.settings.audioResponse = 'mapped-v1'
    saved.settings.audioResponseConfig = { version: 1, sensitivity: 0.4, mappings: [{ target: 'size', source: 'bass-hit', amount: 0.2, attack: 0.03, release: 0.4 }] }
    saved.settings.motion = { minimizing_factor: 0.3 }
    saved.settings.state = { volume_multiplier: 0.2 }
    const { result } = await state({ sceneData: saved })
    expect(result.current.editorAudioResponseMode).toBe('mapped-v1')
    expect(result.current.editorAudioResponseConfig.mappings[0].amount).toBe(0.2)
    act(() => result.current.handleAudioResponseModeChange('legacy'))
    act(() => result.current.updateBranch('intent', branch => ({ ...branch, minimizing_factor: 0.9, fov: 100 })))
    act(() => result.current.handleAudioResponseReset())
    expect(result.current.editorAudioResponseMode).toBe('mapped-v1')
    expect(result.current.editorAudioResponseConfig.mappings[0].amount).toBe(0.2)
    expect(result.current.templateDocument?.settings.motion?.minimizing_factor).toBe(0.3)
    expect(result.current.templateDocument?.settings.state?.volume_multiplier).toBe(0.2)
    expect(result.current.templateDocument?.settings.camera.fov).toBe(100)
    expect(result.current.canResetAudioResponse).toBe(false)
  })
})
