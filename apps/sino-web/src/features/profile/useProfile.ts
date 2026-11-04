import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMe } from '@/features/auth/useAuth'
import { SAMPLE_PROFILE, SAMPLE_SESSIONS } from './profile.sample'
import type { ActiveSessionItem, UserProfileData } from './profile.types'

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const
export const SESSIONS_QUERY_KEY = ['profile', 'sessions'] as const

export function useProfile() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => {
      // In-memory or initial from sample, overridden by auth me if available
      return {
        ...SAMPLE_PROFILE,
        displayName: me?.displayName || SAMPLE_PROFILE.displayName,
        email: me?.email || SAMPLE_PROFILE.email,
      } satisfies UserProfileData
    },
    staleTime: Infinity,
  })

  const sessionsQuery = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => SAMPLE_SESSIONS,
    staleTime: Infinity,
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<UserProfileData>) => {
      // Simulates network latency
      await new Promise((res) => setTimeout(res, 250))
      return updates
    },
    onSuccess: (updates) => {
      queryClient.setQueryData<UserProfileData>(PROFILE_QUERY_KEY, (prev) => {
        if (!prev) return { ...SAMPLE_PROFILE, ...updates }
        return { ...prev, ...updates }
      })
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword: _c, newPassword: _n }: { currentPassword: string; newPassword: string }) => {
      await new Promise((res) => setTimeout(res, 350))
      return true
    },
  })

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await new Promise((res) => setTimeout(res, 150))
      return sessionId
    },
    onSuccess: (sessionId) => {
      queryClient.setQueryData<ActiveSessionItem[]>(SESSIONS_QUERY_KEY, (prev) => {
        if (!prev) return []
        return prev.filter((s) => s.id !== sessionId)
      })
    },
  })

  return {
    profile: profileQuery.data ?? SAMPLE_PROFILE,
    isLoading: profileQuery.isLoading,
    sessions: sessionsQuery.data ?? SAMPLE_SESSIONS,
    updateProfile: updateProfileMutation,
    changePassword: changePasswordMutation,
    revokeSession: revokeSessionMutation,
  }
}

