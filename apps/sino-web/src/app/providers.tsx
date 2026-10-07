import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ThemeProvider } from '@/shared/theme/ThemeProvider'

/** Everything the whole app shares: the server-data cache (TanStack Query) and the theme. */
export function AppProviders({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) {
  const [defaultClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient ?? defaultClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}
