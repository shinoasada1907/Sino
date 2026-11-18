import { cn } from '@/shared/lib/utils'
import type { ChatType, InboxFilter, InboxView } from '../format'

const TABS: { value: InboxView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'reply', label: 'Cần trả lời' },
]

const KINDS: { value: ChatType | null; label: string }[] = [
  { value: null, label: 'Mọi chat' },
  { value: 'direct', label: 'Cá nhân' },
  { value: 'group', label: 'Nhóm' },
]

/**
 * The three tabs of a list: Tất cả, Chưa đọc, Cần trả lời. A tab with something in it has a small red dot instead of its
 * number, which would wrap in a narrow column; the number stays in the accessible name.
 */
export function ViewTabs({
  value,
  counts,
  onChange,
  className,
}: {
  value: InboxView
  counts: { unread: number; needsReply: number }
  onChange: (view: InboxView) => void
  className?: string
}) {
  const countOf = (view: InboxView) => (view === 'unread' ? counts.unread : view === 'reply' ? counts.needsReply : 0)
  return (
    <div role="group" aria-label="Lọc danh sách" className={cn('flex w-full gap-0.5 rounded-full bg-raised p-1 shadow-[inset_0_0_0_1px_var(--border)]', className)}>
      {TABS.map((tab) => {
        const count = countOf(tab.value)
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={tab.value === value}
            onClick={() => onChange(tab.value)}
            className="inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap text-muted-foreground outline-none transition-[background-color,color] duration-(--dur-hover) ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {tab.label}
            {count > 0 && (
              <>
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-danger" />
                <span className="sr-only">{`, ${count} chưa xử lý`}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The filters under the title of Tin nhắn, at every width (canvas `MessagesAccounts`): three tabs with their counts,
 * and the chips Mọi chat / Cá nhân / Nhóm (D-435). The dots follow the counts of the chosen account (D-431).
 */
export function ChatFilters({
  filter,
  counts,
  onFilter,
  className,
}: {
  filter: InboxFilter
  counts: { unread: number; needsReply: number }
  onFilter: (change: Partial<InboxFilter>) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2.5 px-4 pb-3 md:px-3.5', className)}>
      <ViewTabs value={filter.view} counts={counts} onChange={(view) => onFilter({ view })} />
      <div role="group" aria-label="Loại chat" className="flex gap-1.5">
        {KINDS.map((kind) => (
          <button
            key={kind.label}
            type="button"
            aria-pressed={(filter.chatType ?? null) === kind.value}
            onClick={() => onFilter({ chatType: kind.value })}
            className="inline-flex h-7 cursor-pointer items-center rounded-full bg-hover px-3 text-xs font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {kind.label}
          </button>
        ))}
      </div>
    </div>
  )
}
