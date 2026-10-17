import { PublicFrame } from './layout/PublicFrame'
import './public.css'

/*
 * The public pages of sino-web (web-public-pages), one chunk loaded on its own with gsap (D-313): the app never loads
 * it, a visitor loads it once. Each page is the frame of sino-site with the page's tab title.
 */

/** `/` for a visitor who is not signed in: the Sino Messages page (sino-site `/messages`, D-310). */
export function Landing() {
  return <PublicFrame title="Sino Messages · Hộp thư chung cho Gmail và việc cần làm" nav="product" />
}
