import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Me } from '@/features/auth/auth.api'
import { ME_QUERY_KEY, useMe } from '@/features/auth/useAuth'
import { deleteAvatar, fetchProfile, patchProfile, putAvatar } from './profile.api'
import type { UserProfile } from './profile.types'

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const

/**
 * The owner's profile from `GET /api/profile`, and the save (`PATCH`). While the profile is not loaded (or failed),
 * `profile` is a stand-in built from `me`, so the page header still shows who is signed in; `loaded` says which it is.
 * A saved profile also writes the new name and picture into the `me` cache, which the top bar and the user menu read.
 */
export function useProfile() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: ({ signal }) => fetchProfile(signal) })

  const standIn: UserProfile = {
    email: me?.email ?? '',
    displayName: me?.displayName ?? '',
    phoneNumber: null,
    jobTitle: null,
    location: null,
    bio: null,
    role: 'OWNER',
    joinedAt: '',
    avatarUrl: me?.avatarUrl ?? null,
  }

  /** A saved profile (or a picture change) goes into the `profile` cache and into `me`, which the top bar and the menu read. */
  const remember = (saved: UserProfile) => {
    queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, saved)
    queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (previous) =>
      previous ? { ...previous, displayName: saved.displayName, avatarUrl: saved.avatarUrl } : previous,
    )
  }

  const updateProfile = useMutation({ mutationFn: patchProfile, onSuccess: remember })

  /** `PUT` answers the whole profile (D-481). */
  const replaceAvatar = useMutation({ mutationFn: putAvatar, onSuccess: remember })

  /** `DELETE` answers nothing: the picture is dropped from both caches by hand. */
  const removeAvatar = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () => {
      queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, (previous) => (previous ? { ...previous, avatarUrl: null } : previous))
      queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (previous) => (previous ? { ...previous, avatarUrl: null } : previous))
    },
  })

  return {
    profile: query.data ?? standIn,
    loaded: query.data !== undefined,
    isLoading: query.isPending,
    isError: query.isError,
    retry: () => void query.refetch(),
    updateProfile,
    replaceAvatar,
    removeAvatar,
  }
}
