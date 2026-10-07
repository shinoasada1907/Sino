import { cn } from '@/shared/lib/utils'
import { Status, type StatusTone } from '@/shared/ui/status'
import { axisStartLabel, barHeights, formatCount, healthText, syncAriaLabel, type ProviderNameOf } from '../format'
import type { Health, SyncActivity } from '../overview.types'
import { Card, NoData, Spec } from './Card'

const TONE: Record<Health, StatusTone> = { OK: 'ok', WARNING: 'warn', ERROR: 'err' }
const BAR: Record<Health, string> = { OK: 'bg-muted-foreground', WARNING: 'bg-warning', ERROR: 'bg-danger' }

// Canvas `Dashboard` "Dịch vụ · đồng bộ 24 giờ qua": messages synced per hour, hours with trouble coloured.
export function SyncCard({
  activity,
  now,
  nameOf,
  className,
}: {
  activity: SyncActivity | null
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  const title = 'Dịch vụ · đồng bộ 24 giờ qua'
  if (!activity || activity.buckets.length === 0) {
    return (
      <Card surface="bento" title={title} className={cn('gap-3.5', className)}>
        <NoData />
      </Card>
    )
  }

  const total = activity.buckets.reduce((sum, bucket) => sum + bucket.messages, 0)
  const heights = barHeights(activity.buckets)

  return (
    <Card surface="bento" title={title} meta={<Spec>{formatCount(total)} thư</Spec>} className={cn('gap-3.5', className)}>
      <div
        role="img"
        aria-label={syncAriaLabel(activity, nameOf)}
        className="grid h-19 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-0.75"
      >
        {activity.buckets.map((bucket, index) => (
          <span
            key={bucket.start}
            className={cn('block rounded-t-[2px]', BAR[bucket.health])}
            style={{ height: `${heights[index]}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <Spec>{axisStartLabel(activity.buckets[0].start, now)}</Spec>
        <Spec>bây giờ</Spec>
      </div>
      <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2">
        {activity.providers.map((source) => (
          <Status key={source.provider} tone={TONE[source.health]}>
            {healthText(source, nameOf(source.provider))}
          </Status>
        ))}
      </div>
    </Card>
  )
}
