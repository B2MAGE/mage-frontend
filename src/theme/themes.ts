const APP_THEME_CONFIG = [
  {
    colorScheme: 'dark',
    id: 'mage-pulse',
    label: 'MAGE Pulse',
    description: 'Dark, focused, and built around scene content.',
    preview: {
      background:
        'radial-gradient(circle at 60% 45%, rgba(124,108,255,.22), transparent 32%), #090a0d',
      bar: '#171a20',
      rail:
        '#171a20',
      card:
        '#171a20',
    },
  },
  {
    colorScheme: 'light',
    id: 'classic-facebook',
    label: 'Classic Blue',
    description: 'Familiar blue-and-white styling with the full MAGE experience.',
    preview: {
      background: '#e9edf4',
      bar: '#3b5998',
      rail: '#ffffff',
      card: '#ffffff',
    },
  },
] as const

export type AppThemeDefinition = (typeof APP_THEME_CONFIG)[number]
export type AppThemeId = AppThemeDefinition['id']

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
