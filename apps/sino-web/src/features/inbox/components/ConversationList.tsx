import { Calendar, CalendarClock, ChevronDown, Clock, ListFilter, Paperclip, Search, SquareCheck, StickyNote, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { calendarDaysBetween } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Segmented } from '@/shared/ui/segmented'
import { Spec } from '@/shared/ui/spec'
import { groupConversations, previewText, rowFlag, rowTime, sourceLabel, type InboxFilter, type InboxView, type RowFlag, type SourceCount } from '../format'
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

const CHIP =
  'inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-surface px-3 text-[13px] leading-4.5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-foreground aria-pressed:bg-raised aria-pressed:text-foreground'

/**
 * The conversation list in its three shapes: desktop (title, count, view buttons; canvas `Inbox`), tablet (source and
 * view chips; `TabletInbox`) and mobile (own header and source chips above full-width rows; `MobileInbox`). `body`
 * takes the place of the rows while the inbox loads, syncs for the first time or cannot load; there is nothing to
 * filter then, so the filters are left out, as in `InboxState`.
 */
export function ConversationList({
  conversations,
  unread,
  total,
  sources,
  filter,
  onFilter,
  selectedId,
  search,
  now,
  nameOf,
  body,
  className,
}: {
  conversations: ConversationItem[]
  /** "12 chưa đọc" for the current source, or what the list is doing ("đang tải"). */
  unread: string
  /** Unread messages of every source, for the "Tất cả" chip; null while unknown. */
  total: number | null
  sources: SourceCount[]
  filter: InboxFilter
  onFilter: (change: Partial<InboxFilter>) => void
  selectedId: string | null
  search: string
  now: Date
  nameOf: ProviderNameOf
  body?: ReactNode
  className?: string
}) {
  const groups = groupConversations(conversations, now)
  const label = (name: string, count: number | null) => (count ? `${name} · ${count}` : name)
  const filters = body === undefined

  return (
    <div className={cn('min-h-0 flex-col md:border-r', className)}>
      <header className="flex min-h-15 items-center gap-1 py-2 pr-2 pl-4 md:hidden">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Hộp thư</h1>
        <Spec className="ml-2.5 pt-1.5">{unread}</Spec>
        <Button type="button" variant="ghost" size="icon" aria-label="Tìm kiếm" className="ml-auto">
          <Search strokeWidth={1.6} />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Bộ lọc">
          <ListFilter strokeWidth={1.6} />
        </Button>
      </header>
      {filters && (
        <div role="group" aria-label="Nguồn" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:hidden">
          <button type="button" aria-pressed={filter.source === null} onClick={() => onFilter({ source: null })} className={CHIP}>
            {label('Tất cả', total)}
          </button>
          {sources.map((source) => (
            <button key={source.type} type="button" aria-pressed={filter.source === source.type} onClick={() => onFilter({ source: source.type })} className={CHIP}>
              {label(source.name, source.unread)}
            </button>
          ))}
        </div>
      )}

      <section aria-label="Danh sách cuộc trò chuyện" className="min-h-0 flex-1 overflow-auto border-t md:border-t-0">
        {filters && (
          <div role="group" aria-label="Lọc" className="sticky top-0 z-1 hidden flex-wrap gap-2 border-b bg-background px-3 pt-3.5 pb-3 md:flex xl:hidden">
            <span className="relative inline-flex">
              <select
                aria-label="Nguồn"
                value={filter.source ?? ''}
                onChange={(event) => onFilter({ source: event.target.value || null })}
                className={cn(CHIP, 'appearance-none pr-8', filter.source && 'border-foreground bg-raised text-foreground')}
              >
                <option value="">Tất cả nguồn</option>
                {sources.map((source) => (
                  <option key={source.type} value={source.type}>
                    {label(source.name, source.unread)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            </span>
            {TABS.slice(1).map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={filter.view === tab.value}
                onClick={() => onFilter({ view: filter.view === tab.value ? 'all' : tab.value })}
                className={CHIP}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="sticky top-0 z-1 hidden flex-col gap-3.5 border-b bg-background px-4 pt-5 pb-3.5 xl:flex">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Hộp thư</h1>
            <Spec>{unread}</Spec>
          </div>
          {filters && <Segmented label="Lọc danh sách" value={filter.view} options={TABS} onChange={(view) => onFilter({ view })} className="self-start" />}
        </div>
        {body ?? (
          <>
            {groups.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground md:px-5.5">Không có cuộc trò chuyện nào</p>}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-4 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground md:px-5.5">{group.label}</div>
                <div className="flex flex-col md:gap-0.5 md:px-2 md:pb-1">
                  {group.items.map((item) => (
                    <ConversationRow key={item.id} item={item} selected={item.id === selectedId} search={search} now={now} nameOf={nameOf} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  )
}

// Canvas `.mrow` (and `.mob-row` on mobile): unread rows are bold; a chat shows how many messages are unread, an email
// a dot. The source next to the name and the flag line show from 1280px, as in the canvas.
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
      className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-4 py-3 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid md:grid-cols-[36px_minmax(0,1fr)_auto] md:gap-x-3.5 md:rounded-xl md:border md:border-transparent md:p-3.5 md:aria-[current=page]:border-border-strong md:aria-[current=page]:bg-raised"
    >
      <span className="grid size-10 place-items-center rounded-xl border bg-raised text-foreground md:size-9 md:rounded-sm">
        <ProviderIcon provider={item.provider} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.75">
        <span className="flex min-w-0 items-baseline gap-2.5">
          <span data-slot="row-title" className={cn('text-sm whitespace-nowrap', unread ? 'font-bold' : 'font-medium')}>
            {item.title}
          </span>
          <Spec className="hidden truncate xl:inline">{sourceLabel(item, nameOf)}</Spec>
        </span>
        {item.subject && (
          <span className={cn('truncate text-sm', unread ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>{item.subject}</span>
        )}
        <span className="truncate text-[13px] leading-4.5 text-muted-foreground">{previewText(item)}</span>
        {flag && (
          <span
            className={cn(
              'mt-0.75 hidden items-center gap-1.25 font-mono text-[11px] leading-4 font-medium xl:inline-flex',
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
