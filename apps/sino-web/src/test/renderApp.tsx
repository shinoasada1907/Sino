import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers'
import { routes } from '@/app/router'
import { createShellSample } from '@/app/shell/shell.sample'
import type { ShellData } from '@/app/shell/shell.types'
import { SHELL_QUERY_KEY } from '@/app/shell/useShellData'

/** Renders the whole app at `path` with the given shell data already in the query cache. */
export function renderApp(path: string, { shell = createShellSample(new Date()) }: { shell?: ShellData } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(SHELL_QUERY_KEY, shell)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, router, queryClient }
}

/** The element of one shell part (`sidebar`, `rail`, `tabbar`, `topbar`); all are in the DOM because jsdom ignores CSS. */
export function shellPart(name: 'sidebar' | 'rail' | 'tabbar' | 'topbar'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-slot="${name}"]`)
  if (!element) {
    throw new Error(`No [data-slot="${name}"] in the page`)
  }
  return element
}
