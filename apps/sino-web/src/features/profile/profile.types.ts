/** What `GET /api/profile` and `PATCH /api/profile` answer (profile-info, D-478). Empty optional fields are `null`. */
export interface UserProfile {
  email: string
  displayName: string
  phoneNumber: string | null
  jobTitle: string | null
  location: string | null
  bio: string | null
  /** Always `OWNER` today. */
  role: string
  /** ISO instant; empty only in the stand-in built from `me` while the profile is not loaded. */
  joinedAt: string
  /** `/api/profile/avatar?v=<hash>` or `null` (no picture). */
  avatarUrl: string | null
}

/** The fields the owner can edit, in the order of the form. */
export const EDITABLE_FIELDS = ['displayName', 'phoneNumber', 'jobTitle', 'location', 'bio'] as const

export type EditableField = (typeof EDITABLE_FIELDS)[number]

/** A `PATCH`: only the fields that changed; `""` clears an optional field (D-480). */
export type ProfileChange = Partial<Record<EditableField, string>>
