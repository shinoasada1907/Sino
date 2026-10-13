import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { App } from './App'
import { pageForPath, type PageId } from './site/pages'

const root = document.getElementById('root')!
// A built page names itself (data-page, D-250); `pnpm dev` serves the bare index.html, so it goes by the URL.
const prerendered = root.dataset.page as PageId | undefined
const page = pageForPath(window.location.pathname)
const app = (
  <StrictMode>
    <App pageId={prerendered ?? page.id} site={__SITE_DATA__} />
  </StrictMode>
)

if (prerendered) {
  hydrateRoot(root, app)
} else {
  document.title = page.title
  createRoot(root).render(app)
}
