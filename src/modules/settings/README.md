# Settings Module

This directory is the frontend-owned boundary for the authenticated `/settings` experience.

## Public API

Import route-facing settings behavior through `@modules/settings`.

Exports:

- `SettingsPage`

## Internal Responsibilities

- `SettingsPage.tsx`
  Route-facing React boundary for settings.
- `profile.ts`
  Profile save behavior layered on top of `authenticatedFetch()`.
- `password.ts`
  Password change behavior layered on top of `authenticatedFetch()`.
- `ui/ProfileDetailsForm.tsx`
  Settings-owned profile form UI and field-level messages.
- `ui/PasswordChangeForm.tsx`
  Settings-owned password change UI and field-level messages.
- `ui/ThemeSettingsSection.tsx`
  Settings-owned theme selection surface that consumes the theme module API.

## Integration Rules

1. Route wiring should import `SettingsPage` from `@modules/settings`.
2. Settings should consume auth state through `useAuth()` or `authenticatedFetch()`, not by reading auth storage directly.
3. Theme selection UI belongs to settings, but theme runtime state continues to come from `@theme`.

## Route Surface

### `/settings`

Access:

- authenticated-only through the shared route guard

Request flow:

- `PUT /api/users/me`
- `PUT /api/users/me/password`

Expected request body:

```json
{
  "firstName": "Scene",
  "lastName": "Artist",
  "displayName": "Scene Artist"
}
```

Expected password-change body:

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}
```

User-facing behavior:

- renders a theme picker above the profile form
- applies theme changes immediately
- persists the selected theme on the current device through `mage.theme`
- initializes the form from persisted `firstName`, `lastName`, and `displayName` values
- keeps the email field read-only
- disables the save button until a name field changes
- surfaces backend field validation details when present
- updates the shared auth session after a successful save
- renders a password section for local-auth-capable users
- requires current password, new password, and new password verification before saving
- shows a clear unsupported message for Google-only accounts
- surfaces invalid-current-password and backend validation errors when present

Theme notes:

- the settings module does not manage theme CSS directly
- theme selection UI talks to the shared theme provider through `@theme`
- current built-in themes are `MAGE Pulse` and `Classic Blue`

## Tests

Coverage lives in the colocated settings specs under `src/modules/settings/` and related auth specs under `src/modules/auth/`.
