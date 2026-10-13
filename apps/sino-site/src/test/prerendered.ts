import template from '../../index.html?raw'
import { prerender } from '../entry-server'
import type { PageId } from '../site/pages'
import type { SiteData } from '../site/site-data'

/** The HTML a build writes for a page, as text and parsed, without running Vite. */
export function prerendered(pageId: PageId, site: SiteData) {
  const html = prerender(pageId, template, site)
  return { html, doc: new DOMParser().parseFromString(html, 'text/html') }
}

/** Text with runs of white space folded, as a reader sees it. */
export const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

/** [visible text, href] of every link inside `scope`. */
export const links = (scope: Element | null | undefined) =>
  [...(scope?.querySelectorAll('a') ?? [])].map((a) => [text(a), a.getAttribute('href')])

/** The href of the first link whose text is exactly `name`. */
export const hrefOf = (doc: Document, name: string) =>
  [...doc.querySelectorAll('a')].find((a) => text(a) === name)?.getAttribute('href')
