import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError } from '@/shared/api/problem'
import { fetchMe, login, logout } from './auth.api'

export const ME_QUERY_KEY = ['auth', 'me'] as const
export const LOGOUT_MUTATION_KEY = ['auth', 'logout'] as const

/**
 * Who is signed in: `null` when nobody is. Asked once per visit; a session that ends later shows as a 401 on another
 * request, which the app handles (FE-04). No automatic retry: the page offers "Thử lại" itself.
 */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: ({ signal }) => fetchMe(signal), staleTime: Infinity, retry: false })
}

/**
 * After signing out, or when the session ended: everything cached about the owner goes, and the app knows nobody is
 * signed in. The sign-in query itself is kept and set to `null`, so the pages that read it see the change at once.
 */
export function forgetSession(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
  queryClient.getMutationCache().clear()
  queryClient.setQueryData(ME_QUERY_KEY, null)
}

/**
 * Signs out and opens `/login`. A 401 means the session was already gone, which is the same outcome. The move comes
 * first and is committed at once (`flushSync`; React Router otherwise moves in a low-priority transition): the cache
 * tells its readers synchronously, and a gate still on screen would answer "nobody is signed in" with a `returnTo`.
 * The sign-in page, already showing, waits while this mutation runs instead of leaving because it still sees the owner.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationKey: LOGOUT_MUTATION_KEY,
    mutationFn: () =>
      logout().catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) {
          throw error
        }
      }),
    onSuccess: async () => {
      await navigate('/login', { replace: true, flushSync: true })
      forgetSession(queryClient)
    },
  })
}

/** Signs in, then asks who is signed in again; the pages that read `useMe` move on by themselves. */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}
