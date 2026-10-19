import { Check, Clock, LoaderCircle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { UploadEntry } from './useUploadQueue'

/**
 * What the last choice of files came to, one line per file. The progress (waiting, loading, added) sits in a polite
 * `status` region that is always in the page, so a screen reader hears its changes; a refusal is an `alert` of its own,
 * heard at once. "Ẩn thông báo tải lên" clears the finished ones once nothing is loading.
 */
export function UploadList({
  entries,
  active,
  onRetry,
  onDismiss,
}: {
  entries: UploadEntry[]
  active: boolean
  onRetry: (id: number) => void
  onDismiss: () => void
}) {
  const progress = entries.filter((entry) => entry.state !== 'failed')
  const failed = entries.filter((entry) => entry.state === 'failed')

  return (
    <div className={cn('flex flex-col gap-2 px-4 md:px-6', entries.length > 0 && 'pt-3')}>
      <ul role="status" aria-label="Tiến trình tải lên" className="flex list-none flex-col gap-1.5 empty:hidden">
        {progress.map((entry) => (
          <li key={entry.id} className="flex items-center gap-2 text-sm text-muted-foreground">
            {entry.state === 'done' ? (
              <Check aria-hidden="true" className="size-4 text-foreground" strokeWidth={1.8} />
            ) : entry.state === 'uploading' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Clock aria-hidden="true" className="size-4" strokeWidth={1.8} />
            )}
            <span className="min-w-0 truncate">
              {entry.state === 'done' ? `Đã thêm ${entry.name}` : entry.state === 'uploading' ? `Đang tải ${entry.name}…` : `${entry.name}: đang chờ`}
            </span>
          </li>
        ))}
      </ul>
      {failed.map((entry) => (
        <div key={entry.id} role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-danger/45 bg-danger/8 px-3 py-2 text-sm text-danger-ink">
          <p className="min-w-0 grow">
            <span className="font-semibold">{entry.name}</span>: {entry.message}
          </p>
          {entry.retryable && (
            <Button type="button" variant="secondary" size="sm" aria-label={`Thử lại tải ${entry.name}`} onClick={() => onRetry(entry.id)}>
              Thử lại
            </Button>
          )}
        </div>
      ))}
      {entries.length > 0 && !active && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onDismiss}>
          Ẩn thông báo tải lên
        </Button>
      )}
    </div>
  )
}
