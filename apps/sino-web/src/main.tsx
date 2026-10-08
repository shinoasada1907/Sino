import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
// The DOM build of RouterProvider: it is the one that honours `flushSync` on a navigation (sign-out needs it).
import { RouterProvider } from 'react-router/dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { AppProviders } from './app/providers'
import { routes } from './app/router'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
