import { Globe } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatWhen } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { methodLabel, registrationMeta } from '../format'
import type { RegistrationSummary } from '../overview.types'
import { Card, Hairline, NoData, Spec } from './Card'

// Darkest for the most used sign-in method, as in the canvas; the fifth and later share the last shade.
const SHADES = ['bg-foreground', 'bg-muted-foreground', 'bg-subtle-foreground', 'bg-border-strong']

// Canvas `Dashboard` "Đăng ký": websites and apps that use the owner's identity; mobile keeps only the totals.
export function RegistrationsCard({
  registrations,
  now,
  className,
}: {
  registrations: RegistrationSummary | null
  now: Date
  className?: string
}) {
  if (!registrations) {
    return (
      <Card surface="bento" title="Đăng ký" className={cn('gap-4', className)}>
        <NoData />
      </Card>
    )
  }

  const shade = (index: number) => SHADES[Math.min(index, SHADES.length - 1)]
  const breakdown = registrations.byMethod.map((method) => `${methodLabel(method.method)} ${method.count}`).join(', ')
  const latest = registrations.latest

  return (
    <Card
      surface="bento"
      title="Đăng ký"
      meta={<Spec>cập nhật {formatWhen(new Date(registrations.updatedAt), now)}</Spec>}
      className={cn('gap-3 md:gap-4', className)}
    >
      <div className="flex items-end gap-3 md:gap-4">
        <span className="font-mono text-[40px] leading-12 font-medium tracking-[-0.04em] md:text-[56px] md:leading-16">
          {registrations.total}
        </span>
        <span className="pb-1.5 text-sm text-muted-foreground md:pb-2.5">
          website và ứng dụng <span className="hidden md:inline">đang dùng</span>
          <br className="hidden md:block" />
          <span className="hidden md:inline">danh tính của bạn</span>
        </span>
      </div>
      <div role="img" aria-label={`Cách đăng nhập: ${breakdown}`} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {registrations.byMethod.map((method, index) => (
          <span key={method.method} className={cn('block h-full', shade(index))} style={{ flex: method.count }} />
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-x-5 gap-y-2 md:grid">
        {registrations.byMethod.map((method, index) => (
          <span
            key={method.method}
            className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-[13px] leading-[18px] font-medium text-muted-foreground"
          >
            <span aria-hidden="true" className={cn('block size-2.5 rounded-[3px]', shade(index))} />
            {methodLabel(method.method)}
            <span className="font-mono text-xs leading-4 font-medium text-foreground tabular-nums">{method.count}</span>
          </span>
        ))}
      </div>
      {latest && (
        <>
          <Hairline className="hidden md:block" />
          <div className="hidden grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 md:grid">
            <span className="grid size-9 place-items-center rounded-sm border bg-raised text-muted-foreground">
              <Globe className="size-4.5" strokeWidth={1.6} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                {latest.siteName}
                {latest.isNew && (
                  <span className="inline-flex h-5.5 items-center rounded-xs border bg-raised px-2 text-xs leading-4 font-semibold text-muted-foreground">
                    Mới
                  </span>
                )}
              </span>
              <Spec className="truncate">{registrationMeta(latest)}</Spec>
            </div>
            <Button type="button" variant="ghost" size="sm">
              Xem lại
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
