# Theme System

## Overview

The frontend theme system is now organized as a dedicated module boundary under `src/theme/`.

Current themes:

- `mage-pulse` (`MAGE Pulse`)
- `classic-facebook` (`Classic Blue`)

The active theme is applied at the document level, persisted on the current device, and consumed by shared UI surfaces through token families instead of page-by-page color overrides.

## Related Files

- `src/theme/README.md`
- `src/theme/index.ts`
- `src/theme/themes.ts`
- `src/theme/runtime.ts`
- `src/theme/ThemeProvider.tsx`
- `src/theme/theme.css`
- `src/theme/tokens.css`
- `src/theme/themes/classic-facebook/`
- `src/components/settings/ThemeSettingsSection.tsx`
- `src/components/settings/themeSettingsSection.css`

## Module Boundary

Use `@theme` as the public API.

Public exports:

- `ThemeProvider`
- `useTheme()`
- `APP_THEME_STORAGE_KEY`
- `APP_THEMES`
- `APP_THEME_OPTIONS`
- `APP_THEME_DEFINITIONS`
- `DEFAULT_APP_THEME_ID`
- `getAppTheme()`
- `isAppThemeId()`
- `AppThemeDefinition`
- `AppThemeId`
- `AppThemeColorScheme`
- `AppThemePreviewDefinition`

Internal responsibilities:

- `themes.ts`
  Theme registry metadata, preview metadata, and lookup helpers.
- `runtime.ts`
  Document application and theme persistence helpers.
- `ThemeProvider.tsx`
  React context boundary for theme selection.
- `tokens.css`
  Shared token families for reusable surfaces.
- `themes/<theme-id>/`
  Structural theme overrides that cannot be expressed with shared tokens alone.

## Token Families

`src/theme/tokens.css` now defines shared token families for reusable UI surfaces, including:

- nav chrome
- pills
- cards
- tables
- player chrome
- editor surfaces

The shared app CSS consumes those tokens directly. Themes primarily customize the app by overriding token values, while theme CSS files are reserved for layout or behavioral differences that tokens cannot safely represent.

## Settings Integration

The settings page exposes theme selection through `ThemeSettingsSection`.

Behavior:

- switching themes applies immediately
- the selected theme persists on the current device through `mage.theme`
- preview cards are driven by registry metadata in `themes.ts`
- route code does not need to know how themes are stored or applied

## Adding A New Theme

To add another theme safely:

1. Add a new theme definition to `APP_THEME_CONFIG` in `src/theme/themes.ts`, including preview metadata.
2. Add the theme token overrides to `src/theme/tokens.css` under `:root[data-theme='<theme-id>']`.
3. Create a new folder under `src/theme/themes/<theme-id>/` only if the theme needs structural overrides beyond the shared tokens.
4. Add an `index.css` entrypoint for that theme and import it from `src/theme/theme.css`.
5. Verify the shared nav, pill, card, table, player, and editor surfaces inherit the expected theme behavior.
6. Update tests if visible labels or theme options change.

Avoid branching provider logic on specific theme ids. New themes should default to:

- registry metadata in `themes.ts`
- token overrides in `tokens.css`
- targeted structural overrides in `themes/<theme-id>/`

## Tests

Theme persistence and integration coverage currently lives in:

- `src/pages/SettingsPage.test.tsx`
- `src/App.test.tsx`
