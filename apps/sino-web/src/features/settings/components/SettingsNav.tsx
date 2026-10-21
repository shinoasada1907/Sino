import { useEffect, useState } from 'react'
import { useAccountCounts } from '@/features/accounts/useAccounts'
import { cn } from '@/shared/lib/utils'
import { StatusDot } from '@/shared/ui/status'
import { NAV_ITEM, SECTIONS } from '../sections'

/**
 * The section in view (D-393): the first one whose top part is on screen. Without IntersectionObserver (old browsers,
 * the tests) it stays on the one last clicked.
 */
function useSectionInView(ids: string[]) {
  const [current, setCurrent] = useState(ids[0]!)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting))
        const first = ids.find((id) => visible.get(id))
        if (first) {
          setCurrent(first)
        }
      },
      // Only the top third of the screen counts, so the heading just scrolled to is the current one.
      { rootMargin: '0px 0px -66% 0px' },
    )
    ids.forEach((id) => {
      const section = document.getElementById(id)
      if (section) {
        observer.observe(section)
      }
    })
    return () => observer.disconnect()
  }, [ids])
  return [current, setCurrent] as const
}

const SECTION_IDS = SECTIONS.map((section) => section.id)

/** Canvas `.set-nav`: the table of contents beside the sections from 1280 px, staying in view while they scroll. */
export function SettingsNav({ className }: { className?: string }) {
  const [current, setCurrent] = useSectionInView(SECTION_IDS)
  const attention = useAccountCounts()?.needingAction ?? 0
  return (
    <nav aria-label="Mục cài đặt" className={cn('sticky top-0 flex flex-col gap-0.5', className)}>
      <span className="px-2.5 pb-2 text-xs leading-4 font-semibold text-muted-foreground">Cài đặt</span>
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={current === id ? 'location' : undefined}
          // The dot is only a picture: the name says it too, as the "Thêm" page does.
          aria-label={id === 'nguon' && attention > 0 ? `${label}, ${attention} cần xử lý` : undefined}
          onClick={() => setCurrent(id)}
          className={NAV_ITEM}
        >
          <Icon className="size-4.5" strokeWidth={1.6} />
          <span className="truncate">{label}</span>
          {id === 'nguon' && attention > 0 ? <StatusDot tone="err" className="justify-self-center" /> : <span />}
        </a>
      ))}
    </nav>
  )
}
