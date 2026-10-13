import { cn } from '@/shared/lib/utils'

/** The canvas `.progress`: a thin bar for the first sync, read out as "Đã đồng bộ N%". */
function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <span role="img" aria-label={`Đã đồng bộ ${value}%`} className={cn('block h-1 overflow-hidden rounded-full bg-hover', className)}>
      <span className="block h-full rounded-full bg-warning" style={{ width: `${value}%` }} />
    </span>
  )
}

export { Progress }
