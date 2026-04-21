import { readStorageItem, writeStorageItem } from '@shared/lib'
import { DEFAULT_APP_THEME_ID, isAppThemeId, type AppThemeDefinition, type AppThemeId } from './themes'

export const APP_THEME_STORAGE_KEY = 'mage.theme'

export function applyAppTheme(theme: AppThemeDefinition) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme.id
  document.documentElement.style.colorScheme = theme.colorScheme
}

export function readSavedAppThemeId() {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_THEME_ID
  }

  const storedTheme = readStorageItem(APP_THEME_STORAGE_KEY)
  return isAppThemeId(storedTheme) ? storedTheme : DEFAULT_APP_THEME_ID
}

export function persistAppThemeId(themeId: AppThemeId) {
  if (typeof window === 'undefined') {
    return
  }

  writeStorageItem(APP_THEME_STORAGE_KEY, themeId)
}
