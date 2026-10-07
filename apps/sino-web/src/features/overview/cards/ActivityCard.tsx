import { Key, LinkIcon, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { formatWhen } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { activityText, type ProviderNameOf } from '../format'
import type { ActivityItem } from '../overview.types'
import { Card, NoData, Spec } from './Card'

const ICON: Record<ActivityItem['kind'], { icon: LucideIcon; color: string }> = {
  SYNC_RECOVERED: { icon: RefreshCw, color: 'text-warning' },
  REGISTRATION_DETECTED: { icon: Key, color: 'text-muted-foreground' },
  AUTH_EXPIRED: { icon: TriangleAlert, color: 'text-danger' },
  ACCOUNT_CONNECTED: { icon: LinkIcon, color: 'text-muted-foreground' },
}

// Canvas `Dashboard` "Hoạt động gần đây": a timeline of what happened to the accounts and registrations.
export function ActivityCard({
  activity,
  now,
  nameOf,
  className,
}: {
  activity: ActivityItem[] | null
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  const seeAll = (
    <Button asChild variant="ghost" size="sm" className="-mr-2">
      <Link to="/notifications">Xem tất cả</Link>
    </Button>
  )

  return (
    <Card surface="quiet" title="Hoạt động gần đây" meta={seeAll} className={cn('gap-2', className)}>
      {activity === null && <NoData />}
      {activity?.length === 0 && <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>}
      {activity && activity.length > 0 && (
        <ol>
          {activity.map((item) => {
            const { icon: Icon, color } = ICON[item.kind]
            return (
              <li key={item.id} className="grid grid-cols-[56px_16px_minmax(0,1fr)] items-start gap-x-2.5 border-t py-2.75">
                <Spec>{formatWhen(new Date(item.at), now)}</Spec>
                <Icon className={cn('mt-0.5 size-4', color)} strokeWidth={1.6} />
                <span className="text-sm">
                  {activityText(item, nameOf).map((part, index) =>
                    typeof part === 'string' ? part : <strong key={index} className="font-semibold">{part.strong}</strong>,
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
