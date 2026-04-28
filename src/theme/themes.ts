export type AppThemePreviewDefinition = {
  background: string
  bar: string
  rail: string
  card: string
}

const APP_THEME_CONFIG = [
  {
    colorScheme: 'dark',
    id: 'mage-pulse',
    label: 'MAGE Pulse',
    description: 'The current MAGE theme with dark surfaces and luminous accents.',
    preview: {
      background:
        'radial-gradient(circle at top left, rgba(99, 240, 214, 0.18), transparent 50%), linear-gradient(180deg, rgba(8, 18, 21, 0.96), rgba(5, 11, 13, 0.98))',
      bar: 'linear-gradient(90deg, rgba(99, 240, 214, 0.94), rgba(126, 200, 255, 0.86))',
      rail:
        'linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(7, 15, 17, 0.96)), rgba(7, 15, 17, 0.96)',
      card:
        'linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)), rgba(11, 21, 25, 0.96)',
    },
  },
  {
    colorScheme: 'light',
    id: 'classic-facebook',
    label: 'Classic Blue',
    description: 'A blue-and-white retro theme inspired by mid-2000s social media.',
    preview: {
      background: 'linear-gradient(180deg, #eef2f7, #f8f9fb)',
      bar: 'linear-gradient(90deg, #3b5998, #5872a8)',
      rail: '#f7f8fb',
      card: '#ffffff',
    },
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
