import { FadeContent } from '@/shared/motion/FadeContent'
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
 * Canvas `Landing` at /messages (D-253), with text true to what runs today (D-241) and what Sino asks Google for
 * (D-245). The hero enters with CSS; every block below it fades in once when scrolled to (FadeContent, D-252).
 */
export function MessagesPage() {
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
