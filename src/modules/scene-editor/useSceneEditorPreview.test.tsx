import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene, updateBuilderObject } from './builderEditor'
import { useSceneEditorPreview } from './useSceneEditorPreview'

const source = () => createBuilderScene()
afterEach(() => vi.useRealTimers())
describe('editor preview scheduling', () => {
  it('applies live numeric changes immediately and only publishes the newest structural request', () => {
    vi.useFakeTimers()
    const initial = source()
    const hook = renderHook(({ sceneData }) => useSceneEditorPreview({ sceneData }), { initialProps: { sceneData: initial } })
    const camera = { ...initial, settings: { ...initial.settings, camera: { ...initial.settings.camera, fov: 82 } } }
    hook.rerender({ sceneData: camera })
    expect(hook.result.current.isPreviewPending).toBe(false)
    expect(hook.result.current.previewSceneData).toMatchObject({ settings: { camera: { fov: 82 } } })
    const transformed = updateBuilderObject(camera, initial.objects[0].id, object => ({ ...object,
      transform: { ...object.transform, position: { ...object.transform.position, x: 3 } } }))
    hook.rerender({ sceneData: transformed })
    expect(hook.result.current.isPreviewPending).toBe(false)
    expect(hook.result.current.previewSceneData).toEqual(transformed)
    const first = updateBuilderObject(camera, initial.objects[0].id, object => ({ ...object, operation: { type: 'sphere', radius: 2 } }))
    hook.rerender({ sceneData: first })
    expect(hook.result.current.isPreviewPending).toBe(true)
    act(() => vi.advanceTimersByTime(80))
    const second = updateBuilderObject(first, initial.objects[0].id, object => ({ ...object, operation: { type: 'sphere', radius: 3 } }))
    hook.rerender({ sceneData: second })
    act(() => vi.advanceTimersByTime(80))
    expect(hook.result.current.previewSceneData).toEqual(transformed)
    act(() => vi.advanceTimersByTime(40))
    expect(hook.result.current.previewSceneData).toEqual(second)
    expect(hook.result.current.isPreviewPending).toBe(false)
  })

  it('cancels structural work when the draft becomes invalid or the editor unmounts', () => {
    vi.useFakeTimers()
    const initial = source()
    const hook = renderHook(({ sceneData }) => useSceneEditorPreview({ sceneData }), { initialProps: { sceneData: initial } })
    const changed = updateBuilderObject(initial, initial.objects[0].id, object => ({ ...object, operation: { type: 'sphere', radius: 2 } }))
    hook.rerender({ sceneData: changed })
    const invalid = { ...changed, parameters: { ...changed.parameters, scale: -1 } }
    hook.rerender({ sceneData: invalid })
    act(() => vi.advanceTimersByTime(500))
    expect(hook.result.current.previewSceneData).toEqual(initial)
    expect(hook.result.current.previewError).toBeTruthy()
    hook.rerender({ sceneData: changed })
    hook.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains the last valid live values through invalid drafts and cancels a reverted structural edit', () => {
    vi.useFakeTimers()
    const initial = source()
    const move = (x: number) => updateBuilderObject(initial, initial.objects[0].id, object => ({ ...object,
      transform: { ...object.transform, position: { ...object.transform.position, x } } }))
    const hook = renderHook(({ sceneData }) => useSceneEditorPreview({ sceneData }), { initialProps: { sceneData: initial } })
    const valid = move(4)
    hook.rerender({ sceneData: valid })
    hook.rerender({ sceneData: move(101) })
    expect(hook.result.current.previewSceneData).toEqual(valid)
    expect(hook.result.current.previewError).toBeTruthy()
    const structural = updateBuilderObject(valid, initial.objects[0].id, object => ({ ...object, operation: { type: 'sphere', radius: 2 } }))
    hook.rerender({ sceneData: structural })
    expect(hook.result.current.isPreviewPending).toBe(true)
    hook.rerender({ sceneData: valid })
    act(() => vi.advanceTimersByTime(500))
    expect(hook.result.current.previewSceneData).toEqual(valid)
    expect(hook.result.current.isPreviewPending).toBe(false)
    expect(hook.result.current.previewError).toBeNull()
  })
})
