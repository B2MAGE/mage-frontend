export const SETTINGS_SECTIONS = ['appearance', 'profile', 'security'] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function getSettingsSection(hash: string): SettingsSection {
  const section = hash.replace(/^#/, '')

  return SETTINGS_SECTIONS.includes(section as SettingsSection)
    ? section as SettingsSection
    : 'appearance'
}
