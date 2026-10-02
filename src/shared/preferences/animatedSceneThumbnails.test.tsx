import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY,
  getAnimatedSceneThumbnailsEnabled,
  setAnimatedSceneThumbnailsEnabled,
  subscribeToAnimatedSceneThumbnails,
  useAnimatedSceneThumbnailsEnabled,
} from './animatedSceneThumbnails'

describe('animated scene thumbnail preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to enabled and treats unsupported stored values as the default', () => {
    expect(getAnimatedSceneThumbnailsEnabled()).toBe(true)

    window.localStorage.setItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY, 'sometimes')

    expect(getAnimatedSceneThumbnailsEnabled()).toBe(true)
  })

  it('persists updates and immediately notifies same-tab consumers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToAnimatedSceneThumbnails(listener)

    setAnimatedSceneThumbnailsEnabled(false)

    expect(window.localStorage.getItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY)).toBe('false')
    expect(getAnimatedSceneThumbnailsEnabled()).toBe(false)
    expect(listener).toHaveBeenCalledOnce()

    setAnimatedSceneThumbnailsEnabled(false)

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('updates hook consumers when another tab changes the preference', () => {
    const { result } = renderHook(() => useAnimatedSceneThumbnailsEnabled())

    expect(result.current).toBe(true)

    window.localStorage.setItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY, 'false')
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY,
          newValue: 'false',
          storageArea: window.localStorage,
        }),
      )
    })

    expect(result.current).toBe(false)
  })
})
