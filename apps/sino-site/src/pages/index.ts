import type { SiteContext } from '../context.ts'
import type { PageSpec } from '../layout.ts'
import { homePage } from './home.ts'
import { notFoundPage } from './not-found.ts'

/** Every page of the site (D-244). */
export function sitePages(ctx: SiteContext): PageSpec[] {
  return [homePage(ctx), notFoundPage(ctx)]
}
