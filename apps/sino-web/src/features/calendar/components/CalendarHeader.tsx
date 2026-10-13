import { Bell, ChevronLeft, ChevronRight, Mail, Plus, Repeat } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/segmented'
import type { CalendarView } from '../format'

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'agenda', label: 'Lịch trình' },
]

/**
 * Canvas `.cal-head`: the small line and the title of the range, "Hôm nay", the range before and after, the views and
 * "Lịch hẹn" (no flow yet, D-85).
 */
export function CalendarHeader({
  kicker,
  title,
  view,
  onView,
  onShift,
  onToday,
  className,
}: {
  kicker: string
  title: string
  view: CalendarView
  onView: (view: CalendarView) => void
  onShift: (step: -1 | 1) => void
  onToday: () => void
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center gap-3 border-b px-6 py-4.5', className)}>
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-xs leading-4 font-medium text-muted-foreground tabular-nums">{kicker}</span>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">{title}</h1>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onToday}>
        Hôm nay
      </Button>
      <div className="flex gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Khoảng trước" title="Khoảng trước" onClick={() => onShift(-1)}>
          <ChevronLeft strokeWidth={1.6} />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Khoảng sau" title="Khoảng sau" onClick={() => onShift(1)}>
          <ChevronRight strokeWidth={1.6} />
        </Button>
      </div>
      <Segmented label="Chế độ xem" value={view} options={VIEWS} onChange={onView} />
      <Button type="button" variant="primary" size="sm">
        <Plus strokeWidth={1.6} />
        Lịch hẹn
      </Button>
    </header>
  )
}

const LEGEND = 'inline-flex items-center gap-1.5 text-xs leading-4 font-medium text-muted-foreground'

/** Canvas `.cal-legend`: what each mark means, and the time zone of the times. */
export function CalendarLegend({ timeZone, className }: { timeZone: string; className?: string }) {
  return (
    <ul aria-label="Chú giải" className={cn('m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 border-b px-6 py-2.5', className)}>
      <li className={LEGEND}>
        <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] border border-l-[3px] border-border-strong border-l-foreground bg-raised" />
        Lịch hẹn
      </li>
      <li className={LEGEND}>
        <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-border-strong" />
        Task có hạn
      </li>
      <li className={LEGEND}>
        <Bell aria-hidden="true" className="size-3.25" strokeWidth={1.6} />
        Nhắc nhở
      </li>
      <li className={LEGEND}>
        <Repeat aria-hidden="true" className="size-3.25" strokeWidth={1.6} />
        Lặp lại
      </li>
      <li className={LEGEND}>
        <Mail aria-hidden="true" className="size-3.25" strokeWidth={1.6} />
        Tạo từ tin nhắn
      </li>
      <li className={cn(LEGEND, 'ml-auto')}>{timeZone}</li>
    </ul>
  )
}
