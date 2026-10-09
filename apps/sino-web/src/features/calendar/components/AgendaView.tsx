import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import type { CalendarData } from '../calendar.types'
import { agendaDays } from '../format'
import { ItemMark } from './ItemMark'

/**
 * Canvas `.ag`: the days from the first of the range, each with its items (time, mark, title and source, the note on
 * the right). Appointments open their detail; tasks and reminders open the task. On a phone the day column goes above
 * its items.
 */
export function AgendaView({ data, now, search, className }: { data: CalendarData; now: Date; search: string; className?: string }) {
  const days = agendaDays(data, now)

  return (
    <section aria-label="Lịch trình" className={cn('min-h-0 overflow-auto px-4 pt-1 pb-6 md:px-6', className)}>
      {days.length === 0 && <p className="py-6 text-sm text-muted-foreground">Không có gì trong khoảng này.</p>}
      <ol className="m-0 flex list-none flex-col p-0">
        {days.map((day) => (
          <li
            key={day.date}
            data-day={day.date}
            className="grid gap-x-6 gap-y-2 border-t py-4.5 first:border-t-0 md:grid-cols-[128px_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-0.5 md:pt-2.5">
              <span className="text-sm font-semibold">{day.label}</span>
              <Spec>{day.spec}</Spec>
            </div>
            <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
              {day.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.kind === 'event' ? { pathname: item.to, search } : item.to}
                    className={cn(
                      'grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-sm border bg-surface px-3.5 py-2 text-foreground outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid md:grid-cols-[104px_18px_minmax(0,1fr)_auto]',
                      item.kind === 'event' && 'border-l-[3px] border-l-foreground',
                      item.kind === 'task' && 'border-dashed',
                      item.over && 'border-[color-mix(in_srgb,var(--danger)_55%,var(--border))]',
                      item.kind === 'reminder' && 'bg-transparent',
                    )}
                  >
                    <Spec className="text-foreground max-md:col-span-2">{item.time}</Spec>
                    <ItemMark icon={item.icon} provider={item.provider} className="size-4.5 text-muted-foreground max-md:hidden" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className={cn('text-sm font-semibold', item.done && 'text-subtle-foreground line-through')}>{item.title}</span>
                      {item.source && (
                        <span className="inline-flex h-5.5 max-w-70 items-center gap-1.5 self-start rounded-xs border bg-raised pr-2 pl-0.75 text-xs leading-4 font-medium text-muted-foreground">
                          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-surface text-foreground">
                            <ProviderIcon provider={item.source.provider} className="size-2.75" />
                          </span>
                          <span className="truncate">{item.source.title}</span>
                        </span>
                      )}
                    </span>
                    <Spec className={cn('text-right', item.note?.tone === 'err' && 'text-danger-ink')}>{item.note?.text ?? ''}</Spec>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
