import { Bell, ChevronRight, Globe, LogOut, RefreshCw, SunMoon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useLogout, useMe } from '@/features/auth/useAuth'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/theme/themeContext'
import type { Theme } from '@/shared/theme/theme'
import { useNow } from '@/shared/time/useNow'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Segmented } from '@/shared/ui/segmented'
import { Status, StatusDot } from '@/shared/ui/status'
import { LanguageButton } from './LanguageButton'
import { badgeOf, NAV_ITEMS } from './navItems'
import { syncStatus } from './syncStatus'
import { useShellData } from './useShellData'

/** The screens behind the "Thêm" tab, in the order of the canvas. */
const OTHER_SCREENS = ['/notes', '/accounts', '/services', '/registrations', '/notifications', '/settings']

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]

const ROW =
  'grid min-h-13 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 text-[15px] leading-5 font-medium text-foreground last:border-b-0'

/**
 * `/more`, the canvas `MobileMore`: who is signed in, the screens that do not fit the tab bar, the quick settings, and
 * signing out (the canvas has no such button; the spec `web-app-foundation` asks for one on every size).
 */
export function MorePage() {
  const { shell, receivedAt } = useShellData()
  const { data: me } = useMe()
  const { theme, toggleTheme } = useTheme()
  const signOut = useLogout()
  const clock = useNow()
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const attention = shell?.navCounts.accountsNeedingAction ?? 0
  const status = shell ? syncStatus(shell.sync, now) : null

  return (
    <div className="flex flex-col">
      <header className="flex min-h-15 items-center px-4 py-2">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Thêm</h1>
      </header>
      <div className="flex flex-col gap-5 px-4 pt-1 pb-5">
        <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-md border bg-surface p-4">
          <Avatar className="size-12" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-semibold">{me?.displayName ?? shell?.owner.displayName}</span>
            {shell && (
              <span className="text-sm text-muted-foreground">
                {shell.accountCount} tài khoản{attention > 0 ? ` · ${attention} cần xử lý` : ''}
              </span>
            )}
            <span className="truncate font-mono text-[11px] leading-4 font-medium text-muted-foreground">{me?.email}</span>
          </div>
          {attention > 0 && <StatusDot tone="err" />}
        </div>

        <Group title="Đi tới">
          <nav aria-label="Mục khác" className="flex flex-col overflow-hidden rounded-md border bg-surface">
            {OTHER_SCREENS.map((to) => (
              <ScreenLink key={to} to={to} unreadNotifications={shell?.unreadNotifications ?? 0} counts={shell?.navCounts} />
            ))}
          </nav>
        </Group>

        <Group title="Nhanh">
          <div className="flex flex-col overflow-hidden rounded-md border bg-surface">
            <div className={cn(ROW, 'border-b-0')}>
              <SunMoon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
              <span>Giao diện</span>
            </div>
            <div className="border-b px-3.5 pb-3.5">
              <Segmented
                label="Giao diện"
                value={theme}
                options={THEMES}
                onChange={(next) => next !== theme && toggleTheme()}
                className="grid w-full grid-cols-2 *:justify-center"
              />
            </div>
            <div className={ROW}>
              <Globe className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
              <span>Ngôn ngữ</span>
              <LanguageButton />
            </div>
            <div className={ROW}>
              <RefreshCw className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
              <span>Đồng bộ</span>
              {status && <Status tone={status.tone}>{status.short}</Status>}
            </div>
          </div>
        </Group>

        <Button type="button" variant="secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          <LogOut strokeWidth={1.6} />
          Đăng xuất
        </Button>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="pl-1 text-xs leading-4 font-semibold text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

// A row of "Đi tới": the dot of an account needing action, the count of new registrations or unread notifications.
function ScreenLink({ to, counts, unreadNotifications }: { to: string; counts: Parameters<typeof badgeOf>[2]; unreadNotifications: number }) {
  const item = NAV_ITEMS.find((entry) => entry.to === to)
  const label = item?.label ?? 'Thông báo'
  const Icon: LucideIcon = item?.icon ?? Bell
  const { value, name } = badgeOf(label, item?.alert ?? item?.count, counts)
  const notifications = to === '/notifications' ? unreadNotifications : 0
  let end: ReactNode = null
  if (item?.alert?.tone === 'danger' && value > 0) {
    end = <StatusDot tone="err" />
  } else if (item?.count && value > 0) {
    end = <Badge>{`${value} ${item.count.text}`}</Badge>
  } else if (notifications > 0) {
    end = <Badge className="border-primary bg-primary text-primary-foreground">{notifications}</Badge>
  }

  return (
    <Link
      to={to}
      aria-label={notifications > 0 ? `${label}, ${notifications} chưa đọc` : name}
      className={cn(ROW, 'transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid')}
    >
      <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {end}
        <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.6} />
      </span>
    </Link>
  )
}
