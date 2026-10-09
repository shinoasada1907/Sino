import { Calendar, CalendarClock, ChevronDown, Clock, ListFilter, Paperclip, Search, SquareCheck, StickyNote, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { calendarDaysBetween } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Segmented } from '@/shared/ui/segmented'
import { Spec } from '@/shared/ui/spec'
import {
  arrivedRows,
  groupConversations,
  newMailText,
  previewText,
  rowFlag,
  rowTime,
  sourceLabel,
  type InboxFilter,
  type InboxView,
  type RowFlag,
  type SourceCount,
} from '../format'
import type { ConversationItem } from '../inbox.types'
import type { LoadMore } from '../useInbox'
import { ListSkeleton } from './InboxStates'

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
 * filter then, so the filters are left out, as in `InboxState`. Another view keeps the filters and shows the shape of
 * the rows while its first page loads (`switching`); the end of the list loads the next page (`more`).
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
  switching = false,
  more,
  notice,
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
  switching?: boolean
  more?: LoadMore
  /** "N thư mới" while there is new mail from sync (D-92). */
  notice?: { count: number; dismiss: () => void }
  className?: string
}) {
  const groups = groupConversations(conversations, now)
  const arrived = useArrivedRows(conversations, `${filter.view} ${filter.source ?? ''} ${switching}`)
  const scroller = useRef<HTMLElement>(null)
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

      <section ref={scroller} aria-label="Danh sách cuộc trò chuyện" className="min-h-0 flex-1 overflow-auto border-t md:border-t-0">
        {notice && notice.count > 0 && (
          <div role="status" className="pointer-events-none sticky top-3 z-2 flex h-0 justify-center">
            <button
              type="button"
              onClick={() => {
                scroller.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
                notice.dismiss()
              }}
              className="pointer-events-auto h-8 cursor-pointer rounded-full bg-foreground px-3.5 text-xs leading-4 font-semibold text-background shadow-popover outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-safe:animate-row-in"
            >
              {newMailText(notice.count)}
            </button>
          </div>
        )}
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
            {groups.length === 0 &&
              (switching ? <ListSkeleton label="Đang tải danh sách" /> : <p className="px-4 py-6 text-sm text-muted-foreground md:px-5.5">Không có cuộc trò chuyện nào</p>)}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-4 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground md:px-5.5">{group.label}</div>
                <div className="flex flex-col md:gap-0.5 md:px-2 md:pb-1">
                  {group.items.map((item) => (
                    <ConversationRow
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      arrived={arrived.ids.has(item.id) ? (arrived.slide ? 'slide' : 'show') : null}
                      search={search}
                      now={now}
                      nameOf={nameOf}
                    />
                  ))}
                </div>
              </div>
            ))}
            {more && <ListEnd more={more} />}
          </>
        )}
      </section>
    </div>
  )
}

/**
 * The rows that arrived since the list was last read (MotionSpec C), kept until the list changes again so that their
 * animation runs to the end. `resetKey` names what the list shows: another filter or a view still loading starts afresh.
 */
function useArrivedRows(conversations: ConversationItem[], resetKey: string): { ids: Set<string>; slide: boolean } {
  const ids = conversations.map((item) => item.id)
  const idsKey = ids.join(' ')
  const [tracked, setTracked] = useState<{ resetKey: string; idsKey: string; seen: Set<string>; arrived: ReturnType<typeof arrivedRows> } | null>(
    null,
  )
  // Read while rendering, as React advises for state that follows a prop.
  if (tracked === null || tracked.idsKey !== idsKey || tracked.resetKey !== resetKey) {
    const before = tracked !== null && tracked.resetKey === resetKey ? tracked.seen : null
    setTracked({ resetKey, idsKey, seen: new Set(ids), arrived: arrivedRows(before, ids) })
  }
  return tracked?.arrived ?? { ids: new Set(), slide: false }
}

// Canvas `.mrow` (and `.mob-row` on mobile): unread rows are bold; a chat shows how many messages are unread, an email
// a dot. The source next to the name and the flag line show from 1280px, as in the canvas. A row that has just arrived
// slides in (only fades when motion is reduced), or appears at once when many arrived together.
function ConversationRow({
  item,
  selected,
  arrived,
  search,
  now,
  nameOf,
}: {
  item: ConversationItem
  selected: boolean
  arrived: 'slide' | 'show' | null
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
      data-arrived={arrived ?? undefined}
      className="grid grid-cols-[40px_minmax(0,1fr)_auto] data-[arrived=slide]:motion-safe:animate-row-in data-[arrived=slide]:motion-reduce:animate-fade-in items-start gap-x-3 border-b px-4 py-3 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid md:grid-cols-[36px_minmax(0,1fr)_auto] md:gap-x-3.5 md:rounded-xl md:border md:border-transparent md:p-3.5 md:aria-[current=page]:border-border-strong md:aria-[current=page]:bg-raised"
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

/**
 * The end of the list: "Tải thêm" loads the next page, and does it by itself when it comes near the screen (infinite
 * scroll), so keyboard and screen reader users have the same way as everyone else. A failed page says so and retries.
 */
function ListEnd({ more: { hasMore, loading, failed, load } }: { more: LoadMore }) {
  const button = useRef<HTMLButtonElement>(null)
  const waiting = hasMore && !loading && !failed

  useEffect(() => {
    const target = button.current
    if (!waiting || !target || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && load(), { rootMargin: '240px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [waiting, load])

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-4 py-5">
        <span className="text-sm text-muted-foreground">Không tải thêm được.</span>
        <Button type="button" variant="secondary" size="sm" onClick={load}>
          Thử lại
        </Button>
      </div>
    )
  }
  if (loading) {
    return (
      <p role="status" className="px-4 py-5 text-center text-sm text-muted-foreground">
        Đang tải thêm…
      </p>
    )
  }
  return hasMore ? (
    <div className="flex justify-center px-4 py-4">
      <Button ref={button} type="button" variant="ghost" size="sm" onClick={load}>
        Tải thêm
      </Button>
    </div>
  ) : null
}

function FlagGlyph({ kind }: { kind: RowFlag['kind'] }) {
  const Icon = FLAG_ICONS[kind]
  return <Icon className="size-3 shrink-0" strokeWidth={1.6} />
}
