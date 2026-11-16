import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { PAGE_TITLES } from '@/features/public/pageTitles'
import { Landing, PrivacyEn, PrivacyVi } from '@/features/public/PublicPages'

/*
 * The server entry of the prerender step (public-pages-prerender, D-460): `vite build --ssr` bundles it, and
 * `scripts/prerender.mjs` calls it once per public page while `pnpm build` runs. The same components the browser shows,
 * drawn to a string with a static router; nothing here runs on a server at request time.
 */

export interface PrerenderedPage {
  html: string
  title: string
  lang: 'vi' | 'en'
}

const PAGES = {
  '/': { title: PAGE_TITLES.home, lang: 'vi', Page: Landing },
  '/privacy': { title: PAGE_TITLES.privacyVi, lang: 'vi', Page: PrivacyVi },
  '/en/privacy': { title: PAGE_TITLES.privacyEn, lang: 'en', Page: PrivacyEn },
} as const

/** The body of one public page as HTML, with the tab title and language the page declares. */
export function prerenderPage(route: string): PrerenderedPage {
  const page = PAGES[route as keyof typeof PAGES]
  if (!page) throw new Error(`prerender: no public page at ${route}`)
  const { Page, title, lang } = page
  const html = renderToString(
    <StaticRouter location={route}>
      <Page />
    </StaticRouter>,
  )
  return { html, title, lang }
}
