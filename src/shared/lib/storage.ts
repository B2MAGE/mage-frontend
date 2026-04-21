function readLocalStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readStorageItem(key: string) {
  const storage = readLocalStorage()

  if (!storage) {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorageItem(key: string, value: string) {
  const storage = readLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(key, value)
  } catch {
    // Ignore storage failures so UI state can continue in-memory.
  }
}

export function removeStorageItem(key: string) {
  const storage = readLocalStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage failures so logout/bootstrap flows can still proceed.
  }
}
