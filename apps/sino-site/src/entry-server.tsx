import { renderToString } from 'react-dom/server'
import { App } from './App'
import { renderDocument } from './site/document'
import { pageById, type PageId } from './site/pages'
import type { SiteData } from './site/site-data'

export { PAGES } from './site/pages'

/** The HTML file of one page: the app rendered to a string inside the client build's index.html (D-250). */
export function prerender(pageId: PageId, template: string, site: SiteData = __SITE_DATA__): string {
  const appHtml = renderToString(<App pageId={pageId} site={site} />)
  return renderDocument({ template, page: pageById(pageId), site, appHtml })
}
