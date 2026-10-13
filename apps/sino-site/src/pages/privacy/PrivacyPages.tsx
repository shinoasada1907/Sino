import { PolicyPage } from './PolicyPage'
import { PRIVACY_EN } from './privacy.en'
import { PRIVACY_VI } from './privacy.vi'

/** Canvas `SitePrivacy` at /privacy: the privacy policy of the Sino family, the one declared to Google (D-253). */
export function PrivacyPage() {
  return <PolicyPage doc={PRIVACY_VI} lang="vi" />
}

/** The same policy at /en/privacy (D-243). */
export function PrivacyPageEn() {
  return <PolicyPage doc={PRIVACY_EN} lang="en" />
}
