import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  APP_THEME_OPTIONS,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME_ID,
  getAppTheme,
  isAppThemeId,
  type AppThemeDefinition,
  type AppThemeId,
} from './themes'
import { readStorageItem, writeStorageItem } from '@shared/lib'

type ThemeContextValue = {
  setTheme: (themeId: AppThemeId) => void
  theme: AppThemeDefinition
  themeId: AppThemeId
  themes: AppThemeDefinition[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: AppThemeDefinition) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme.id
  document.documentElement.style.colorScheme = theme.colorScheme
}

function readInitialTheme() {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_THEME_ID
  }

  const storedTheme = readStorageItem(APP_THEME_STORAGE_KEY)
  return isAppThemeId(storedTheme) ? storedTheme : DEFAULT_APP_THEME_ID
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeId] = useState<AppThemeId>(() => readInitialTheme())
  const theme = useMemo(() => getAppTheme(themeId), [themeId])

  useEffect(() => {
    applyTheme(theme)
    if (typeof window !== 'undefined') {
      writeStorageItem(APP_THEME_STORAGE_KEY, themeId)
    }
  }, [theme, themeId])

  const setTheme = useCallback((nextThemeId: AppThemeId) => {
    setThemeId((currentThemeId) =>
      currentThemeId === nextThemeId ? currentThemeId : nextThemeId,
    )
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      setTheme,
      theme,
      themeId,
      themes: APP_THEME_OPTIONS,
    }),
    [setTheme, theme, themeId],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.')
  }

  return context
}
