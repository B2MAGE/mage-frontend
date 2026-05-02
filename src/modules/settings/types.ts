export type ProfileNameFields = {
  firstName: string
  lastName: string
  displayName: string
}

export type UserProfileResponse = {
  userId: number | null
  email: string
  firstName?: string
  lastName?: string
  displayName: string
  authProvider: string
  createdAt?: string
}

export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; details: Record<string, string>; message: string }

export type PasswordChangeFields = {
  currentPassword: string
  newPassword: string
}

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; code?: string; details: Record<string, string>; message: string }
