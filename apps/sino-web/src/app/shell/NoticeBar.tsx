import { X } from 'lucide-react'
import { Link } from 'react-router'
import { newMailText } from '@/features/inbox/format'
import { SCREENS } from '@/features/inbox/screen'
import type { ProviderKind } from '@/shared/domain'
import { Button } from '@/shared/ui/button'
import type { ArrivalNotice } from './useArrivalNotices'

/**
 * The bar under the top bar of every screen (NF-02, D-319): one row for each kind with new conversations, "Xem" to its
 * screen and a button to close it. The status region is always there, empty and without height, so that a screen reader
 * announces the first row when it comes. Not in the canvas: the neutral look of the notice of the list (D-92).
 */
export function NoticeBar({ notices, onDismiss }: { notices: ArrivalNotice[]; onDismiss: (kind: ProviderKind) => void }) {
  return (
    <div role="status" data-slot="notice-bar" className="row-start-2">
      {notices.map(({ kind, count }) => {
        const text = newMailText(count, kind)
        return (
          <div key={kind} className="flex items-center gap-3 border-b bg-surface px-4 py-1.5 text-sm md:px-6 xl:px-8">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-foreground" />
            <span className="min-w-0 truncate">{text}</span>
            <Button asChild variant="secondary" size="sm" className="ml-auto">
              <Link to={SCREENS[kind].path} aria-label={`Xem ${text}`} onClick={() => onDismiss(kind)}>
                Xem
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Đóng thông báo ${text}`} onClick={() => onDismiss(kind)}>
              <X strokeWidth={1.6} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
