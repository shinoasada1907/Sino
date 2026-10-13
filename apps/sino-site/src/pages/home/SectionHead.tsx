import type { ReactNode } from 'react'
import { eyebrow, heading2, lead as leadText } from '@/shared/ui/text'

/** Canvas `lp-sec-head`: a mono label, the section title and an optional lead. */
export function SectionHead({ label, id, title, lead }: { label: string; id: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <div className="flex max-w-190 flex-col gap-3.5">
      <span className={eyebrow}>{label}</span>
      <h2 className={heading2} id={id}>
        {title}
      </h2>
      {lead && <p className={leadText}>{lead}</p>}
    </div>
  )
}

/** Canvas `lp-sec`: a home page section the top bar links to, clear of the sticky bar when jumped to. */
export const sectionClass = 'flex scroll-mt-15 flex-col gap-7 pt-20 md:scroll-mt-18 md:gap-10 md:pt-30'

/** "Sắp có" next to something Sino does not do yet (D-241). */
export const SOON = 'Sắp có'
