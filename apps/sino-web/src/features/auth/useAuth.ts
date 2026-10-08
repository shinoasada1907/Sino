import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, login } from './auth.api'

export const ME_QUERY_KEY = ['auth', 'me'] as const

/**
 * Who is signed in: `null` when nobody is. Asked once per visit; a session that ends later shows as a 401 on another
 * request, which the app handles (FE-04). No automatic retry: the page offers "Thử lại" itself.
 */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: ({ signal }) => fetchMe(signal), staleTime: Infinity, retry: false })
}

/** Signs in, then asks who is signed in again; the pages that read `useMe` move on by themselves. */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  })
}
