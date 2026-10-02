import { useSyncExternalStore } from 'react'
import { readStorageItem, writeStorageItem } from '@shared/lib/storage'

export const ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY = 'mage.animated-scene-thumbnails'

const ENABLED_STORAGE_VALUE = 'true'
const DISABLED_STORAGE_VALUE = 'false'
const listeners = new Set<() => void>()

let volatileValue: boolean | null = null
let removeStorageListener: (() => void) | null = null

function parseStoredPreference(value: string | null) {
  if (value === ENABLED_STORAGE_VALUE) {
    return true
  }

  if (value === DISABLED_STORAGE_VALUE) {
    return false
  }

  return null
}

function emitPreferenceChange() {
  listeners.forEach((listener) => listener())
}

function listenForStorageChanges() {
  if (typeof window === 'undefined' || removeStorageListener) {
    return
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY) {
      return
    }

    volatileValue = null
    emitPreferenceChange()
  }

  window.addEventListener('storage', handleStorage)
  removeStorageListener = () => {
    window.removeEventListener('storage', handleStorage)
    removeStorageListener = null
  }
}

export function getAnimatedSceneThumbnailsEnabled() {
  const storedValue = parseStoredPreference(
    readStorageItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY),
  )

  return volatileValue ?? storedValue ?? true
}

export function setAnimatedSceneThumbnailsEnabled(enabled: boolean) {
  const currentValue = getAnimatedSceneThumbnailsEnabled()
  const serializedValue = enabled ? ENABLED_STORAGE_VALUE : DISABLED_STORAGE_VALUE

  volatileValue = enabled
  writeStorageItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY, serializedValue)

  if (readStorageItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY) === serializedValue) {
    volatileValue = null
  }

  if (currentValue !== enabled) {
    emitPreferenceChange()
  }
}

export function subscribeToAnimatedSceneThumbnails(listener: () => void) {
  listeners.add(listener)
  listenForStorageChanges()

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0) {
      removeStorageListener?.()
    }
  }
}

export function useAnimatedSceneThumbnailsEnabled() {
  return useSyncExternalStore(
    subscribeToAnimatedSceneThumbnails,
    getAnimatedSceneThumbnailsEnabled,
    () => true,
  )
}
