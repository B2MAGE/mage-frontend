# Settings Page

## Overview

The settings page shows the authenticated user's profile details and the frontend theme selector.
It allows the user to:

- switch the current UI theme for this device
- save updated `firstName`, `lastName`, and `displayName` values through the backend profile endpoint

The frontend keeps the email field read-only and refreshes the shared auth session after a
successful save so updated name values remain available across the app.

Route:

- `/settings`

Access:

- authenticated-only through the shared route guard

## Related Files

- `src/modules/settings/SettingsPage.tsx`
- `src/modules/settings/SettingsPage.test.tsx`
- `src/modules/settings/profile.ts`
- `src/modules/settings/ui/ProfileDetailsForm.tsx`
- `src/modules/settings/ui/ThemeSettingsSection.tsx`
- `src/modules/settings/ui/themeSettingsSection.css`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/AuthProvider.test.tsx`
- `src/modules/auth/guards.tsx`
- `src/lib/authForm.ts`
- `src/theme/ThemeProvider.tsx`
- `src/theme/themes.ts`

## Request Flow

Primary request:

- `PUT /api/users/me`

Expected request body:

```json
{
  "firstName": "Scene",
  "lastName": "Artist",
  "displayName": "Scene Artist"
}
```

Requests are sent through `authenticatedFetch()`, which applies the bearer token and clears the
stored session automatically if the backend returns `401`.

## User-Facing Behavior

- renders a theme picker above the profile form
- applies theme changes immediately
- persists the selected theme on the current device through `mage.theme`
- initializes the form from persisted `firstName`, `lastName`, and `displayName` values
- keeps the email field read-only
- disables the save button until a name field changes
- shows a loading state while the save request is in flight
- surfaces backend field validation details when present
- shows a generic unavailable message when the save request fails
- updates the shared auth session through `updateAuthenticatedUser()` after a successful save
- keeps `displayName` as the public-facing name used on scenes, comments, and other attribution surfaces

## Theme Notes

The settings module does not manage theme CSS directly. Its `ThemeSettingsSection` UI talks to the
shared theme provider through the stable `@theme` API.

Current built-in themes:

- `MAGE Pulse`
- `Classic Blue`

## Auth Session Notes

Successful saves update the in-memory auth state and the stored `mage.auth.session` snapshot. That
lets a subsequent app reload restore the saved profile values without waiting for another manual
edit.

## Tests

Main coverage lives in:

- `src/modules/settings/SettingsPage.test.tsx`
- `src/modules/auth/AuthProvider.test.tsx`
- `src/modules/auth/guards.test.tsx`

Run them with:

```bash
npm run test
```
