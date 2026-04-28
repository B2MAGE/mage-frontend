import { createContext, useContext } from 'react'
import type { AppThemeDefinition, AppThemeId } from './themes'

export type ThemeContextValue = {
  setTheme: (themeId: AppThemeId) => void
  theme: AppThemeDefinition
  themeId: AppThemeId
  themes: readonly AppThemeDefinition[]
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.')
  }

  return context
}
