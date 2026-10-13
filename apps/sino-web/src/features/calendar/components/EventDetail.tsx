import { Bell, Calendar, ChevronRight, Ellipsis, Pencil, Repeat, SquareCheck, StickyNote, Trash2, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { recurrenceLabel } from '@/features/tasks/format'
import type { RelatedItem } from '@/features/tasks/tasks.types'
import type { ProviderNameOf } from '@/shared/format'
import { formatClock, weekdayShort } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import type { CalendarEvent } from '../calendar.types'
import { eventKindLabel, eventReminder, eventWhen } from '../format'

const RELATED: Record<RelatedItem['kind'], { icon: LucideIcon; to: (item: RelatedItem) => string }> = {
  TASK: { icon: SquareCheck, to: (item) => `/tasks/${item.id}` },
  EVENT: { icon: Calendar, to: (item) => `/calendar/${item.id}` },
  NOTE: { icon: StickyNote, to: () => '/notes' },
}

/**
 * Canvas `Calendar`, block "Chi tiết lịch hẹn": kind, title and when, reminder, repeat rule and place, the message it
 * came from (opens the inbox), notes, related items. "Sửa", "Thêm thao tác" and "Xóa lịch hẹn" have no flow yet
 * (D-85); "Đóng" goes back to the calendar.
 */
export function EventDetail({ event, now, nameOf, close }: { event: CalendarEvent; now: Date; nameOf: ProviderNameOf; close: string }) {
  const rule = recurrenceLabel(event.recurrence)

  return (
    <>
      <div className="hidden items-center justify-between gap-3 md:flex">
        <span className="text-xs leading-4 font-semibold text-muted-foreground">{eventKindLabel(event)}</span>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Sửa" title="Sửa">
            <Pencil strokeWidth={1.6} />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Thêm thao tác" title="Thêm thao tác">
            <Ellipsis strokeWidth={1.6} />
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link to={close} aria-label="Đóng" title="Đóng">
              <X strokeWidth={1.6} />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{event.title}</h2>
        <span className="text-sm text-muted-foreground">{eventWhen(event, now)}</span>
      </div>

      <dl className="m-0 grid grid-cols-[104px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3">
        <Fact term="Nhắc">
          {event.reminder && <Bell aria-hidden="true" className="mr-1.25 inline size-3.25 align-[-2px] text-muted-foreground" strokeWidth={1.6} />}
          {eventReminder(event)}
        </Fact>
        <Fact term="Lặp lại">
          {rule && <Repeat aria-hidden="true" className="mr-1.25 inline size-3.25 align-[-2px] text-muted-foreground" strokeWidth={1.6} />}
          {rule ?? 'Không'}
        </Fact>
        {event.location && <Fact term="Địa điểm">{event.location}</Fact>}
      </dl>

      {event.source && (
        <Section title="Tạo từ tin nhắn">
          <Link
            to={`/inbox/${event.source.conversationId}`}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border bg-raised px-3.5 py-3 text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] border bg-raised text-foreground">
              <ProviderIcon provider={event.source.provider} className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {event.source.title} · {nameOf(event.source.provider)}
              </span>
              {/* An email by its subject, a chat by the start of its message (canvas: "Trần Minh Anh · Gmail", "Gia đình · Zalo"). */}
              {(event.source.subject ?? event.source.preview) && (
                <span className="truncate text-sm text-muted-foreground">{event.source.subject ?? event.source.preview}</span>
              )}
            </span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.6} />
          </Link>
        </Section>
      )}

      {event.notes && (
        <Section title="Ghi chú">
          <p className="text-sm text-muted-foreground">{event.notes}</p>
        </Section>
      )}

      {event.related && event.related.length > 0 && (
        <Section title="Liên quan">
          <div className="flex flex-wrap gap-2">
            {event.related.map((item) => {
              const { icon: Icon, to } = RELATED[item.kind]
              return (
                <Link
                  key={item.id}
                  to={to(item)}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border bg-surface pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="truncate">{item.title}</span>
                  {item.at && <Spec className="truncate">{`${weekdayShort(new Date(item.at))} ${formatClock(new Date(item.at))}`}</Spec>}
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      <div className="mt-auto flex flex-wrap gap-2.5 border-t pt-5">
        <Button type="button" variant="secondary" size="sm">
          <Pencil strokeWidth={1.6} />
          Sửa
        </Button>
        <Button type="button" variant="danger" size="sm">
          <Trash2 strokeWidth={1.6} />
          Xóa lịch hẹn
        </Button>
      </div>
    </>
  )
}

// Canvas `.kv.kv-tight`: one term and its value.
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[13px] leading-4.5 font-medium text-muted-foreground">{term}</dt>
      <dd className="m-0 text-sm font-medium">{children}</dd>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      <span className="text-xs leading-4 font-semibold text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}
