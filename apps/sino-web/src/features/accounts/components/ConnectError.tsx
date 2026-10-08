import { TriangleAlert } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { connectErrorMessage } from '../connect.format'

/** What went wrong when the provider sent the user back with `?connectError={CODE}` (catalog of F04a), and a retry. */
export function ConnectError({ code, onRetry, className }: { code: string; onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5',
        className,
      )}
    >
      <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">Chưa kết nối được tài khoản</span>
        <span className="text-sm text-muted-foreground">{connectErrorMessage(code)}</span>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}
