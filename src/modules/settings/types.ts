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
