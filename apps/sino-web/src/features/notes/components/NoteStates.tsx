import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'

const SKELETON_CARDS = [58, 72, 46, 64]

/** The shape of the list while it loads (no canvas for this state; as the other screens). */
export function NotesSkeleton() {
  return (
    <div role="status" aria-label="Đang tải ghi chú" className="flex flex-col gap-1 p-4 md:w-80 xl:w-105">
      <span className="sr-only">Đang tải ghi chú</span>
      {SKELETON_CARDS.map((width, index) => (
        <div key={index} aria-hidden="true" className="flex flex-col gap-2 rounded-xl px-3.5 py-3.5">
          <span className="h-3 animate-pulse rounded-full bg-hover" style={{ width: `${width}%` }} />
          <span className="h-2.5 w-11/12 animate-pulse rounded-full bg-hover" />
          <span className="h-2.5 w-2/3 animate-pulse rounded-full bg-hover" />
        </div>
      ))}
    </div>
  )
}

/** "Không tải được ghi chú" with a way to try again. */
export function NotesLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4.5 px-7 py-10">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger"
      >
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được ghi chú</h2>
        <p className="text-sm text-muted-foreground">Ghi chú của bạn vẫn còn nguyên. Hãy thử lại.</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw strokeWidth={1.6} />
        Thử lại
      </Button>
    </div>
  )
}
