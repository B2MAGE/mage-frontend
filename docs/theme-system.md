# Theme System

## Overview

The frontend now has a shared theme system instead of page-specific theme forks. The active theme is applied at the document level, persisted on the current device, and consumed by shared route/layout surfaces.

Current themes:

- `mage-pulse` (`MAGE Pulse`)
- `classic-facebook` (`Classic Blue`)

## Related Files

- `src/theme/themes.ts`
- `src/theme/ThemeProvider.tsx`
- `src/theme/theme.css`
- `src/theme/tokens.css`
- `src/theme/themes/classic-facebook/`
- `src/components/settings/ThemeSettingsSection.tsx`
- `src/components/settings/themeSettingsSection.css`

## Architecture

The theme system is split into three layers:

1. **Theme registry**

   `src/theme/themes.ts` is the single source of truth for available themes. Each theme definition includes:

   - `id`
   - `label`
   - `description`
   - `colorScheme`

2. **Theme provider**

   `ThemeProvider`:

   - reads the saved theme from `localStorage`
   - falls back to `DEFAULT_APP_THEME_ID`
   - applies `data-theme` to `document.documentElement`
   - applies `document.documentElement.style.colorScheme`
   - exposes `theme`, `themeId`, `themes`, and `setTheme()`

3. **Theme CSS**

   `src/theme/theme.css` is only an entrypoint. It imports:

   - shared tokens from `tokens.css`
   - one CSS entrypoint per non-default theme

   Theme-specific overrides should live under `src/theme/themes/<theme-id>/`.

## Current CSS Structure

Shared tokens:

- `src/theme/tokens.css`

Classic Blue modules:

- `chrome.css`
- `home.css`
- `discovery.css`
- `library.css`
- `editor.css`
- `player.css`
- `index.css` as the theme entrypoint

This keeps large theme work split by surface area instead of collecting everything in one file.

## Settings Integration

The settings page exposes theme selection through `ThemeSettingsSection`.

Behavior:

- switching themes applies immediately
- the selected theme persists on the current device through `mage.theme`
- the current theme is exposed to the app without route code needing to know implementation details

## Adding A New Theme

To add another theme:

1. Add a new theme definition to `APP_THEME_CONFIG` in `src/theme/themes.ts`
2. Create a new folder under `src/theme/themes/<theme-id>/`
3. Add an `index.css` file for that theme and split it by surface area as needed
4. Import that theme entrypoint from `src/theme/theme.css`
5. Add a preview style in `src/components/settings/themeSettingsSection.css`
6. Update tests if the visible theme labels or options change

Avoid adding provider logic that branches on specific theme ids. Theme-specific behavior should usually come from:

- registry metadata in `themes.ts`
- CSS selectors like `html[data-theme='<theme-id>'] ...`

## Tests

Theme persistence and selection coverage currently lives in:

- `src/pages/SettingsPage.test.tsx`
- route/theme provider integration checks in `src/App.test.tsx`
