import { api } from '@/shared/api/client'
import type { ProfileChange, UserProfile } from './profile.types'

export const fetchProfile = (signal?: AbortSignal) => api.get<UserProfile>('/api/profile', signal)

export const patchProfile = (change: ProfileChange) => api.patch<UserProfile>('/api/profile', change)
