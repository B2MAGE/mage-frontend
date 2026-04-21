import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  APP_THEME_OPTIONS,
  getAppTheme,
  type AppThemeId,
} from './themes'
import { applyAppTheme, persistAppThemeId, readSavedAppThemeId } from './runtime'
import { ThemeContext, type ThemeContextValue } from './themeContext'

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeId] = useState<AppThemeId>(() => readSavedAppThemeId())
  const theme = useMemo(() => getAppTheme(themeId), [themeId])

  useEffect(() => {
    applyAppTheme(theme)
    persistAppThemeId(themeId)
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
