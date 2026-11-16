import { api } from '@/shared/api/client'
import type { ProfileChange, UserProfile } from './profile.types'

export const fetchProfile = (signal?: AbortSignal) => api.get<UserProfile>('/api/profile', signal)

export const patchProfile = (change: ProfileChange) => api.patch<UserProfile>('/api/profile', change)

/** `PUT /api/profile/avatar`, multipart part `file` (D-481); answers the whole profile, with the new `avatarUrl`. */
export const putAvatar = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.putForm<UserProfile>('/api/profile/avatar', form)
}

/** `DELETE /api/profile/avatar`: 204, and 204 again when there was no picture (D-481). */
export const deleteAvatar = () => api.delete<void>('/api/profile/avatar')
