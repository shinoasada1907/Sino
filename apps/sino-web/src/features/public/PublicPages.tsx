import { LandingPage } from './landing/LandingPage'
import { PublicFrame } from './layout/PublicFrame'
import { PAGE_TITLES } from './pageTitles'
import { PolicyPage } from './privacy/PolicyPage'
import { PRIVACY_EN } from './privacy/privacy.en'
import { PRIVACY_VI } from './privacy/privacy.vi'
import './public.css'

/*
 * The public pages of sino-web (web-public-pages), one chunk loaded on its own with gsap (D-313): the app never loads
 * it, a visitor loads it once. Each page is the frame of sino-site with the page's tab title.
 */

/** `/` for a visitor who is not signed in: the Sino Messages page (sino-site `/messages`, D-310). */
export function Landing() {
  return (
    <PublicFrame title={PAGE_TITLES.home} nav="product">
      <LandingPage />
    </PublicFrame>
  )
}

/** `/privacy`: the privacy policy, the one Sino Messages declares to Google (sino-site D-253). */
export function PrivacyVi() {
  return (
    <PublicFrame title={PAGE_TITLES.privacyVi} nav="family" alternate={{ lang: 'en', path: '/en/privacy' }}>
      <PolicyPage doc={PRIVACY_VI} lang="vi" />
    </PublicFrame>
  )
}

/** `/en/privacy`: the same policy in English (sino-site D-243). */
export function PrivacyEn() {
  return (
    <PublicFrame title={PAGE_TITLES.privacyEn} lang="en" nav="family" alternate={{ lang: 'vi', path: '/privacy' }}>
      <PolicyPage doc={PRIVACY_EN} lang="en" />
    </PublicFrame>
  )
}
