export const APP_THEME_STORAGE_KEY = 'mage.theme'

const APP_THEME_CONFIG = [
  {
    colorScheme: 'dark',
    id: 'mage-pulse',
    label: 'MAGE Pulse',
    description: 'The current MAGE theme with dark surfaces and luminous accents.',
  },
  {
    colorScheme: 'light',
    id: 'classic-facebook',
    label: 'Classic Blue',
    description: 'A blue-and-white retro theme inspired by mid-2000s social media.',
  },
] as const

export type AppThemeDefinition = (typeof APP_THEME_CONFIG)[number]
export type AppThemeId = AppThemeDefinition['id']
export type AppThemeColorScheme = AppThemeDefinition['colorScheme']

export const APP_THEMES = [...APP_THEME_CONFIG] as readonly AppThemeDefinition[]
export const DEFAULT_APP_THEME_ID: AppThemeId = 'mage-pulse'

export const APP_THEME_DEFINITIONS: Record<AppThemeId, AppThemeDefinition> = Object.fromEntries(
  APP_THEMES.map((theme) => [theme.id, theme]),
) as Record<AppThemeId, AppThemeDefinition>

export const APP_THEME_OPTIONS = [...APP_THEMES]
const APP_THEME_ID_SET = new Set<AppThemeId>(APP_THEMES.map((theme) => theme.id))

export function getAppTheme(themeId: AppThemeId) {
  return APP_THEME_DEFINITIONS[themeId]
}

export function isAppThemeId(value: string | null | undefined): value is AppThemeId {
  return typeof value === 'string' && APP_THEME_ID_SET.has(value as AppThemeId)
}
