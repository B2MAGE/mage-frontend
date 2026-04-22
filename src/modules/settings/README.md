# Settings Module

This directory is the dedicated frontend-owned boundary for the `/settings` experience.

## Public API

Import route-facing settings behavior through `@modules/settings`.

Exports:

- `SettingsPage`

## Internal Responsibilities

- `SettingsPage.tsx`
  Route-facing React boundary for settings.
- `profile.ts`
  Profile save behavior layered on top of `authenticatedFetch`.
- `ui/ProfileDetailsForm.tsx`
  Settings-owned profile form UI and field-level messages.
- `ui/ThemeSettingsSection.tsx`
  Settings-owned theme selection surface that consumes the theme module API.

## Integration Rules

1. Route wiring should import `SettingsPage` from `@modules/settings`.
2. Settings should consume auth state through `useAuth()` or `authenticatedFetch`, not by reading auth storage directly.
3. Theme selection UI belongs to settings, but theme runtime state continues to come from `@theme`.
