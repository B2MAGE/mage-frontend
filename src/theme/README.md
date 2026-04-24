# Theme Module

This directory is the public module boundary for application theming.

## Public API

Import theme behavior through `@theme` instead of deep file paths.

Exports:

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

## Internal Responsibilities

- `themes.ts`
  Theme registry metadata and lookup helpers.
- `runtime.ts`
  Document application and local storage persistence.
- `ThemeProvider.tsx`
  React context boundary for the active theme.
- `tokens.css`
  Shared design-token families used by reusable UI surfaces.
- `themes/<theme-id>/`
  Theme-specific structural overrides that cannot be expressed through shared tokens alone.

## Adding A Theme

1. Add the theme definition in `themes.ts`, including `preview` metadata for settings UI.
2. Add token overrides in `tokens.css` under `:root[data-theme='<theme-id>']`.
3. Create `themes/<theme-id>/index.css` only for structural/layout differences that the shared tokens do not cover.
4. Import the new theme entrypoint from `theme.css`.
5. Verify the shared surfaces still inherit the expected nav, card, pill, table, player, and editor tokens.

## Integration Rules

1. Mount `ThemeProvider` once in app-level provider composition.
2. Import theme state and registry metadata through `@theme`, not through deep file paths.
3. Feature-specific theme selection UI belongs to the owning feature module, currently `@modules/settings`.
4. The theme boundary should not depend on app wiring or feature-module internals.
