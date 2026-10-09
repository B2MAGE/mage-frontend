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
  Theme token palettes and base styles. Page structure belongs to feature-owned stylesheets.

## Adding A Theme

1. Add the theme definition in `themes.ts`, including `preview` metadata for settings UI.
2. Add token overrides in the theme entrypoint under `:root[data-theme='<theme-id>']`. Keep selector specificity consistent with the base tokens.
3. Keep base theme rules in `themes/<theme-id>/index.css`, app navigation in the app shell, and page-specific layouts with the owning feature.
4. Import the new theme entrypoint from `theme.css`.
5. Verify the shared surfaces still inherit the expected nav, card, pill, table, player, and editor tokens.

## Integration Rules

1. Mount `ThemeProvider` once in app-level provider composition.
2. Import theme state and registry metadata through `@theme`, not through deep file paths.
3. Feature-specific theme selection UI belongs to the owning feature module, currently `@modules/settings`.
4. The theme boundary should not depend on app wiring or feature-module internals.

## Shared Layout And Behavior

Pulse and Classic Blue use the same home, discovery, account, studio, and player
components. Theme selection changes their palette and visual density, not their
available features or navigation. Classic retains its blue masthead, light panels,
compact borders, and Tahoma-based type; user-selected avatar gradients are unchanged.

Keep responsive structure and interaction states in the feature stylesheets using
`html[data-theme]`. Use semantic tokens, or feature-local palette variables with
Pulse defaults, for colors. Classic-specific skins use
`:root[data-theme='classic-facebook']` so they win over shared layout rules without
depending on CSS import order. Do not add theme-only React branches for common
features such as featured scenes, editor steps, confirmation, or player controls.

Verify both themes at desktop and narrow widths, including menus, keyboard focus,
selected reactions, loading/error states, and custom avatar colors. Theme runtime
regressions live in `classicTheme.test.tsx`; feature behavior stays in its module tests.
