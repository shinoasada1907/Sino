// Copied from apps/sino-site/src/pages/messages/MessagesPage.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { FadeContent } from '../motion/FadeContent'
import { Band } from './Band'
import { Faq } from './Faq'
import { Features } from './Features'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { Planning } from './Planning'
import { Privacy } from './Privacy'
import { ProviderStrip } from './ProviderStrip'

const BLOCKS = [ProviderStrip, Features, Planning, HowItWorks, Privacy, Faq, Band]

/**
 * Canvas `Landing`, at / of sino-web (D-310) as at /messages of sino-site, with text true to what runs today (sino-site
 * D-241) and what Sino asks Google for (D-245). The hero enters with CSS; every block below it fades in once when
 * scrolled to (FadeContent, D-252).
 */
export function LandingPage() {
  return (
    <>
      <Hero />
      {BLOCKS.map((Block, i) => (
        <FadeContent key={i}>
          <Block />
        </FadeContent>
      ))}
    </>
  )
}
