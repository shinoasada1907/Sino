import {
  Archive,
  Calendar,
  Ellipsis,
  Inbox,
  MessageSquare,
  PenLine,
  Plus,
  Send,
  Settings2,
  SquareCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useAccounts } from '@/features/accounts/useAccounts'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'
import type { ShellData } from './shell.types'
import { UserMenu } from './UserMenu'
import { useInbox } from '@/features/inbox/useInbox'

interface SubAccount {
  id: string
  name: string
  count: number
  dotClass?: string
  to: string
}

// Desktop navigation (>= 1280 px), matching the user-customized multi-account structure.
export function Sidebar({ shell, className }: { shell: ShellData | undefined; className?: string }) {
  const { pathname } = useLocation()
  const isProfileActive = pathname === '/profile'
  const { list } = useAccounts()
  const accounts = list?.accounts ?? []
  const { inbox: emailInbox } = useInbox('EMAIL')
  const { inbox: chatInbox } = useInbox('CHAT')

  // Collapse / expand states, default to open
  const [emailOpen, setEmailOpen] = useState(true)
  const [zaloOpen, setZaloOpen] = useState(true)
  const [messengerOpen, setMessengerOpen] = useState(true)

  // Dynamic email accounts from connected accounts
  const emailAccounts: SubAccount[] = useMemo(() => {
    return accounts
      .filter((a) => a.provider?.toLowerCase() === 'gmail')
      .map((a) => ({
        id: a.id,
        name: a.address || a.displayName || 'Gmail',
        count: emailInbox?.counts.byAccount?.[a.id]?.unread ?? 0,
        to: `/inbox?account=${encodeURIComponent(a.id)}`,
      }))
  }, [accounts, emailInbox?.counts])

  // Dynamic Zalo accounts from connected accounts
  const zaloAccounts: SubAccount[] = useMemo(() => {
    return accounts
      .filter((a) => a.provider?.toLowerCase() === 'zalo')
      .map((a) => ({
        id: a.id,
        name: a.displayName ? `Zalo — ${a.displayName}` : a.address || 'Zalo',
        count: chatInbox?.counts.byAccount?.[a.id]?.unread ?? 0,
        dotClass: 'bg-emerald-500',
        to: `/messages?account=${encodeURIComponent(a.id)}`,
      }))
  }, [accounts, chatInbox?.counts])

  // Dynamic Messenger accounts from connected accounts
  const messengerAccounts: SubAccount[] = useMemo(() => {
    return accounts
      .filter((a) => a.provider?.toLowerCase() === 'messenger')
      .map((a) => ({
        id: a.id,
        name: a.displayName ? `Fanpage ${a.displayName}` : a.address || 'Messenger',
        count: chatInbox?.counts.byAccount?.[a.id]?.unread ?? 0,
        dotClass: 'bg-muted-foreground/60',
        to: `/messages?account=${encodeURIComponent(a.id)}`,
      }))
  }, [accounts, chatInbox?.counts])

  const defaultEmailTo = emailAccounts[0]?.to ?? '/inbox'
  const zaloTotal = (shell?.navCounts?.messagesUnread != null && shell.navCounts.messagesUnread > 0) ? shell.navCounts.messagesUnread : undefined
  const messengerUnread = chatInbox?.counts.byProvider?.find((p) => p.provider === 'messenger')?.unread ?? 0
  const messengerTotal = messengerUnread > 0 ? messengerUnread : undefined
  const tasksDue = shell?.navCounts?.tasksDue

  return (
    <aside
      data-slot="sidebar"
      className={cn('flex flex-col overflow-y-auto border-r bg-background px-3 py-4 text-foreground select-none', className)}
    >
      {/* Brand logo */}
      <div className="mb-4 flex h-9 items-center gap-2.5 px-2 text-foreground">
        <SinoMark className="size-5" />
        <span className="text-lg font-bold tracking-[-0.03em]">Sino</span>
      </div>

      <nav aria-label="Điều hướng chính" className="flex grow flex-col gap-5 overflow-y-auto">
        {/* Section: THƯ ĐIỆN TỬ (GMAIL) */}
        <div className="flex flex-col gap-1">
          <SectionHeader>THƯ ĐIỆN TỬ (GMAIL)</SectionHeader>

          {/* Hộp thư đến */}
          <div>
            <SidebarMainItem
              to={defaultEmailTo}
              icon={Inbox}
              label="Hộp thư đến"
              onToggle={() => setEmailOpen((prev) => !prev)}
            />
            {emailOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {emailAccounts.map((acc) => (
                  <SubAccountLink key={acc.id} item={acc} />
                ))}
                <AddAccountLink to="/accounts?add=gmail" label="Thêm tài khoản email" />
              </div>
            )}
          </div>

          <SidebarMainItem to="/inbox?folder=sent" icon={Send} label="Đã gửi" />
          <SidebarMainItem to="/inbox?folder=trash" icon={Trash2} label="Thư rác" />
          <SidebarMainItem to="/inbox?folder=archive" icon={Archive} label="Đã lưu trữ" />
        </div>

        {/* Section: TIN NHẮN */}
        <div className="flex flex-col gap-1">
          <SectionHeader>TIN NHẮN</SectionHeader>

          {/* Zalo */}
          <div>
            <SidebarMainItem
              to="/messages"
              icon={MessageSquare}
              label="Zalo"
              badge={zaloTotal !== undefined && zaloTotal > 0 ? zaloTotal : undefined}
              spoken={zaloTotal !== undefined && zaloTotal > 0 ? `${zaloTotal} chưa đọc` : undefined}
              onToggle={() => setZaloOpen((prev) => !prev)}
            />
            {zaloOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {zaloAccounts.map((acc) => (
                  <SubAccountLink key={acc.id} item={acc} />
                ))}
                <AddAccountLink to="/accounts?add=zalo" label="Thêm tài khoản Zalo" />
              </div>
            )}
          </div>

          {/* Messenger */}
          <div>
            <SidebarMainItem
              to="/messages?channel=messenger"
              icon={MessageSquare}
              label="Messenger"
              badge={messengerTotal}
              spoken={messengerTotal ? `${messengerTotal} chưa đọc` : undefined}
              onToggle={() => setMessengerOpen((prev) => !prev)}
            />
            {messengerOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {messengerAccounts.map((acc) => (
                  <SubAccountLink key={acc.id} item={acc} />
                ))}
                <AddAccountLink to="/accounts?add=messenger" label="Thêm tài khoản Messenger" />
              </div>
            )}
          </div>
        </div>

        {/* Section: KẾ HOẠCH */}
        <div className="flex flex-col gap-1">
          <SectionHeader>KẾ HOẠCH</SectionHeader>
          <SidebarMainItem to="/calendar" icon={Calendar} label="Lịch" showDotWhenActive />
          <SidebarMainItem
            to="/tasks"
            icon={SquareCheck}
            label="Việc cần làm"
            badge={tasksDue !== undefined && tasksDue > 0 ? tasksDue : undefined}
            spoken={tasksDue !== undefined && tasksDue > 0 ? `${tasksDue} tới hạn` : undefined}
            showDotWhenActive
          />
          <SidebarMainItem to="/notes" icon={PenLine} label="Ghi chú" showDotWhenActive />
        </div>
      </nav>

      {/* Footer Profile & Menu */}
      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        <SidebarMainItem to="/settings" icon={Settings2} label="Cài đặt" />
        <div
          className={cn(
            'flex items-center justify-between gap-2.5 rounded-xl border p-2 transition-colors',
            isProfileActive ? 'border-border/80 bg-surface-raised font-semibold' : 'bg-surface hover:bg-hover/60',
          )}
        >
          <Link
            to="/profile"
            className="group flex min-w-0 flex-1 items-center gap-2.5 outline-none cursor-pointer"
            aria-label="Hồ sơ cá nhân"
          >
            <Avatar className="transition-transform group-hover:scale-105" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {shell?.owner.displayName ?? 'Người dùng Sino'}
              </span>
              <span className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
                {shell && shell.accountCount !== null ? `${shell.accountCount} tài khoản` : ''}
              </span>
            </div>
          </Link>
          <UserMenu>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Tài khoản Sino của bạn">
              <Ellipsis strokeWidth={1.6} />
            </Button>
          </UserMenu>
        </div>
      </div>
    </aside>
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="px-3 pt-2 pb-1 font-mono text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted-foreground/75 uppercase">
      {children}
    </div>
  )
}

function SidebarMainItem({
  to,
  icon: Icon,
  label,
  badge,
  spoken,
  showDotWhenActive = false,
  onToggle,
}: {
  to: string
  icon: LucideIcon
  label: string
  badge?: number
  spoken?: string
  showDotWhenActive?: boolean
  onToggle?: () => void
}) {
  const { pathname, search } = useLocation()
  const targetUrl = new URL(to, 'https://sino.local')
  const currentPath = pathname
  const currentSearch = search

  // Exact matching when query parameters are present, otherwise pathname match
  const isMatch = label === 'Hộp thư đến'
    ? currentPath === '/inbox'
    : targetUrl.search
      ? currentPath === targetUrl.pathname && currentSearch === targetUrl.search
      : currentPath === targetUrl.pathname

  const accessibleName = spoken ? `${label}, ${spoken}` : label

  return (
    <NavLink
      to={to}
      aria-label={accessibleName}
      onClick={() => {
        if (onToggle && isMatch) {
          onToggle()
        }
      }}
      className={({ isActive }) => {
        const active = isMatch || (isActive && !targetUrl.search && !currentSearch)
        return cn(
          'group flex h-10 shrink-0 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium transition-colors outline-none',
          active
            ? 'border-border/70 bg-surface-raised font-semibold text-foreground shadow-xs'
            : 'text-muted-foreground hover:bg-hover hover:text-foreground'
        )
      }}
    >
      {({ isActive }) => {
        const active = isMatch || (isActive && !targetUrl.search && !currentSearch)
        return (
          <>
            <Icon
              className="size-4.5 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              strokeWidth={1.6}
            />
            <span className="truncate">{label}</span>

            {badge !== undefined && (
              <span
                aria-hidden="true"
                className="ml-auto rounded-md bg-secondary/80 px-2 py-0.5 font-mono text-xs font-medium text-foreground"
              >
                {badge}
              </span>
            )}

            {badge === undefined && showDotWhenActive && active && (
              <span aria-hidden="true" className="ml-auto size-2 rounded-full bg-foreground shadow-xs" />
            )}
          </>
        )
      }}
    </NavLink>
  )
}

function SubAccountLink({ item }: { item: SubAccount }) {
  const { pathname, search } = useLocation()
  const targetUrl = new URL(item.to, 'https://sino.local')
  const active = pathname === targetUrl.pathname && search === targetUrl.search

  return (
    <NavLink
      to={item.to}
      className={cn(
        'flex h-7 items-center gap-2.5 rounded-md px-3 pl-7 text-xs font-medium transition-colors',
        active
          ? 'font-semibold text-foreground bg-hover/60'
          : 'text-muted-foreground hover:bg-hover/30 hover:text-foreground'
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', item.dotClass ?? 'bg-muted-foreground/60')} />
      <span className="truncate">{item.name}</span>
      <span className="ml-auto font-mono text-[11px] text-muted-foreground/80">{item.count}</span>
    </NavLink>
  )
}

function AddAccountLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className="flex h-7 items-center gap-2 rounded-md px-3 pl-7 text-xs text-muted-foreground/70 transition-colors hover:bg-hover/30 hover:text-foreground"
    >
      <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}
