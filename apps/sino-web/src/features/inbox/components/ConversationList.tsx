import { Calendar, CalendarClock, Clock, Paperclip, SquareCheck, StickyNote, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { calendarDaysBetween } from '@/shared/time/local'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Segmented } from '@/shared/ui/segmented'
import { Spec } from '@/shared/ui/spec'
import { groupConversations, previewText, rowFlag, rowTime, sourceLabel, type InboxView, type RowFlag } from '../format'
import type { ConversationItem } from '../inbox.types'

const TABS: { value: InboxView; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'reply', label: 'Cần trả lời' },
]

const FLAG_ICONS: Record<RowFlag['kind'], LucideIcon> = {
  SCHEDULE_FAILED: TriangleAlert,
  RESURFACED: Clock,
  SCHEDULED: CalendarClock,
  TASK: SquareCheck,
  EVENT: Calendar,
  NOTE: StickyNote,
}

/** The middle column of the canvas `Inbox`: title and unread count, the view buttons, the day groups of rows. */
export function ConversationList({
  conversations,
  unread,
  view,
  onView,
  selectedId,
  search,
  now,
  nameOf,
  className,
}: {
  conversations: ConversationItem[]
  unread: string
  view: InboxView
  onView: (view: InboxView) => void
  selectedId: string | null
  search: string
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  const groups = groupConversations(conversations, now)
  return (
    <section aria-label="Danh sách cuộc trò chuyện" className={cn('min-h-0 overflow-auto border-r', className)}>
      <div className="sticky top-0 z-1 flex flex-col gap-3.5 border-b bg-background px-4 pt-5 pb-3.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Hộp thư</h1>
          <Spec>{unread}</Spec>
        </div>
        <Segmented label="Lọc danh sách" value={view} options={TABS} onChange={onView} className="self-start" />
      </div>
      {groups.length === 0 && <p className="px-5.5 py-6 text-sm text-muted-foreground">Không có cuộc trò chuyện nào</p>}
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-5.5 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground">{group.label}</div>
          <div className="flex flex-col gap-0.5 px-2 pb-1">
            {group.items.map((item) => (
              <ConversationRow key={item.id} item={item} selected={item.id === selectedId} search={search} now={now} nameOf={nameOf} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// Canvas `.mrow`: unread rows are bold; a chat shows how many messages are unread, an email a dot.
function ConversationRow({
  item,
  selected,
  search,
  now,
  nameOf,
}: {
  item: ConversationItem
  selected: boolean
  search: string
  now: Date
  nameOf: ProviderNameOf
}) {
  const unread = item.unreadCount > 0
  const flag = rowFlag(item, now)
  const today = calendarDaysBetween(new Date(item.lastMessageAt), now) === 0

  return (
    <Link
      to={{ pathname: `/inbox/${item.id}`, search }}
      aria-current={selected ? 'page' : undefined}
      className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-x-3.5 rounded-xl border border-transparent p-3.5 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-border-strong aria-[current=page]:bg-raised"
    >
      <span className="grid size-9 place-items-center rounded-sm border bg-raised text-foreground">
        <ProviderIcon provider={item.provider} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.75">
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span data-slot="row-title" className={cn('text-sm whitespace-nowrap', unread ? 'font-bold' : 'font-medium')}>
            {item.title}
          </span>
          <Spec className="truncate">{sourceLabel(item, nameOf)}</Spec>
        </span>
        {item.subject && (
          <span className={cn('truncate text-sm', unread ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>{item.subject}</span>
        )}
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">{previewText(item)}</span>
        {flag && (
          <span
            className={cn(
              'mt-0.75 inline-flex items-center gap-1.25 font-mono text-[11px] leading-4 font-medium',
              flag.tone === 'err' ? 'text-danger-ink' : 'text-muted-foreground',
            )}
          >
            <FlagGlyph kind={flag.kind} />
            {flag.text}
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-2 pt-0.5">
        <Spec className={today ? 'text-foreground' : undefined}>{rowTime(item, now)}</Spec>
        {unread && item.kind === 'CHAT' && (
          <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-xs bg-primary px-1.5 font-mono text-[11px] leading-4 font-semibold text-primary-foreground">
            {item.unreadCount}
            <span className="sr-only"> tin chưa đọc</span>
          </span>
        )}
        {unread && item.kind === 'EMAIL' && <span role="img" aria-label="Chưa đọc" className="size-2 rounded-full bg-foreground" />}
        {!unread && item.hasAttachments && (
          <Paperclip role="img" aria-label="Có tệp đính kèm" className="size-3.5 text-muted-foreground" strokeWidth={1.6} />
        )}
      </span>
    </Link>
  )
}

function FlagGlyph({ kind }: { kind: RowFlag['kind'] }) {
  const Icon = FLAG_ICONS[kind]
  return <Icon className="size-3 shrink-0" strokeWidth={1.6} />
}
