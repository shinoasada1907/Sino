import { lazy, Suspense } from 'react'
import type { Lang } from './layout/nav'

// The same chunk as the Sino Messages page (D-313).
const PrivacyVi = lazy(() => import('./PublicPages').then((module) => ({ default: module.PrivacyVi })))
const PrivacyEn = lazy(() => import('./PublicPages').then((module) => ({ default: module.PrivacyEn })))

/** `/privacy` and `/en/privacy` (D-310): public, whoever is or is not signed in, so no session is asked for. */
export function PrivacyRoute({ lang }: { lang: Lang }) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>{lang === 'en' ? <PrivacyEn /> : <PrivacyVi />}</Suspense>
  )
}
