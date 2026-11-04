import { Bell, Search, SlidersHorizontal, SquarePen } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { ThemeToggle } from '@/shared/theme/ThemeToggle'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Kbd } from '@/shared/ui/kbd'
import { SinoMark } from '@/shared/ui/sino-mark'
import { Status } from '@/shared/ui/status'
import { Avatar } from '@/shared/ui/avatar'
import { LanguageButton } from './LanguageButton'
import type { ShellData } from './shell.types'
import { syncStatus } from './syncStatus'
import { UserMenu } from './UserMenu'

// The canvas `Topbar` on desktop; on tablet and mobile a shorter bar with the page title (`TabletDashboard`, `MobileDashboard`).
export function Topbar({
  shell,
  receivedAt,
  title,
  className,
}: {
  shell: ShellData | undefined
  receivedAt: number
  title: string
  className?: string
}) {
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, not from the last tick.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const status = shell ? syncStatus(shell.sync, now) : null

  return (
    <header data-slot="topbar" className={cn('border-b bg-background', className)}>
      <div className="hidden h-18 items-center gap-4 px-8 xl:flex">
        <div className="relative w-full max-w-110">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <Input
            type="search"
            placeholder="Tìm kiếm thư, tin nhắn hoặc liên hệ…"
            aria-label="Tìm trong Sino"
            className="pr-16 pl-10.5"
          />
          <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2">Ctrl K</Kbd>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Action button "Viết mới" */}
          <Button asChild size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 font-medium rounded-lg px-3.5 h-9">
            <Link to="/inbox/new">
              <SquarePen className="size-4" strokeWidth={1.8} />
              <span>Viết mới</span>
            </Link>
          </Button>

          {status && <Status tone={status.tone}>{status.text}</Status>}
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
          <BellLink unread={shell?.unreadNotifications ?? 0} />
          
          <Button variant="ghost" size="icon" aria-label="Bộ lọc & Cài đặt">
            <SlidersHorizontal className="size-4.5" strokeWidth={1.6} />
          </Button>

          <ThemeToggle />
          <LanguageButton />

          <UserMenu>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-1 rounded-full p-0" aria-label="Tài khoản Sino của bạn">
              <Avatar className="size-8" />
            </Button>
          </UserMenu>
        </div>
      </div>

      <div className="flex h-15 items-center gap-1 pr-2 pl-4 md:h-16 md:gap-2 md:pr-4 md:pl-6 xl:hidden">
        <SinoMark className="size-5 shrink-0 md:hidden" />
        <span className="ml-2 truncate text-xl leading-7 font-semibold tracking-[-0.01em] md:ml-0">{title}</span>
        {status && (
          <Status tone={status.tone} className="ml-3 hidden md:inline-flex">
            {status.short}
          </Status>
        )}
        <div className="ml-auto flex items-center gap-1">
          <BellLink unread={shell?.unreadNotifications ?? 0} />
          <LanguageButton />
        </div>
      </div>
    </header>
  )
}

function BellLink({ unread }: { unread: number }) {
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link to="/notifications" aria-label={unread > 0 ? `Thông báo, ${unread} mới` : 'Thông báo'}>
        <Bell className="size-4.5" strokeWidth={1.6} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-background"
          />
        )}
      </Link>
    </Button>
  )
}
