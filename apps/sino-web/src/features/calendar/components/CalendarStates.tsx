import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'

/** The shape of the calendar while it loads (no canvas for this state; as the other screens). */
export function CalendarSkeleton() {
  return (
    <div role="status" aria-label="Đang tải lịch" className="flex flex-col gap-3 p-6">
      <span className="sr-only">Đang tải lịch</span>
      {[70, 45, 60, 35].map((width, index) => (
        <span key={index} aria-hidden="true" className="h-10 animate-pulse rounded-sm bg-hover" style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

/** "Không tải được lịch" with a way to try again. */
export function CalendarLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4.5 px-7 py-10">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger"
      >
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được lịch</h2>
        <p className="text-sm text-muted-foreground">Lịch hẹn và việc của bạn vẫn còn nguyên. Hãy thử lại.</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw strokeWidth={1.6} />
        Thử lại
      </Button>
    </div>
  )
}
