import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Me } from '@/features/auth/auth.api'
import { ME_QUERY_KEY, useMe } from '@/features/auth/useAuth'
import { fetchProfile, patchProfile } from './profile.api'
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

  const updateProfile = useMutation({
    mutationFn: patchProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData<UserProfile>(PROFILE_QUERY_KEY, saved)
      queryClient.setQueryData<Me | null>(ME_QUERY_KEY, (previous) =>
        previous ? { ...previous, displayName: saved.displayName, avatarUrl: saved.avatarUrl } : previous,
      )
    },
  })

  return {
    profile: query.data ?? standIn,
    loaded: query.data !== undefined,
    isLoading: query.isPending,
    isError: query.isError,
    retry: () => void query.refetch(),
    updateProfile,
  }
}
