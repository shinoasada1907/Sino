import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'

const SKELETON_ROWS = [62, 48, 70, 55, 40]

/** The shape of the list while it loads (no canvas for this screen; as the inbox's `InboxState`). */
export function TasksSkeleton() {
  return (
    <div role="status" aria-label="Đang tải việc cần làm" className="flex flex-col gap-1 p-4 md:p-8">
      <span className="sr-only">Đang tải việc cần làm</span>
      {SKELETON_ROWS.map((width, index) => (
        <div key={index} aria-hidden="true" className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-3.5 px-1 py-3 md:px-3.5">
          <span className="size-5.5 animate-pulse rounded-full bg-hover" />
          <span className="flex flex-col gap-2 pt-0.5">
            <span className="h-3 animate-pulse rounded-full bg-hover" style={{ width: `${width}%` }} />
            <span className="h-2.5 w-1/3 animate-pulse rounded-full bg-hover" />
          </span>
        </div>
      ))}
    </div>
  )
}

/** "Không tải được việc cần làm" with a way to try again. */
export function TasksLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4.5 px-7 py-10">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger"
      >
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được việc cần làm</h2>
        <p className="text-sm text-muted-foreground">Việc của bạn vẫn còn nguyên. Hãy thử lại.</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw strokeWidth={1.6} />
        Thử lại
      </Button>
    </div>
  )
}
