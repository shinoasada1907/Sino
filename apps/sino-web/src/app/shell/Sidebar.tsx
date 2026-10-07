import { Ellipsis } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'
import { badgeOf, NAV_GROUP_LABELS, NAV_ITEMS, type NavItem } from './navItems'
import type { ShellData } from './shell.types'

// Desktop navigation (>= 1280 px), the canvas `Sidebar`.
export function Sidebar({ shell, className }: { shell: ShellData | undefined; className?: string }) {
  const items = (group: NavItem['group']) =>
    NAV_ITEMS.filter((item) => item.group === group).map((item) => (
      <SidebarLink key={item.to} item={item} shell={shell} />
    ))

  return (
    <aside
      data-slot="sidebar"
      className={cn('flex-col overflow-y-auto border-r bg-background px-4 py-5', className)}
    >
      <div className="mb-5 flex h-10 items-center gap-2.5 px-2 text-foreground">
        <SinoMark className="size-5" />
        <span className="text-lg font-bold tracking-[-0.03em]">Sino</span>
      </div>
      <nav aria-label="Điều hướng chính" className="flex grow flex-col gap-1">
        {items('main')}
        <GroupLabel>{NAV_GROUP_LABELS.plan}</GroupLabel>
        {items('plan')}
        <GroupLabel>{NAV_GROUP_LABELS.identity}</GroupLabel>
        {items('identity')}
      </nav>
      <div className="flex flex-col gap-3 border-t pt-3">
        {items('footer')}
        <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border bg-surface p-2">
          <Avatar />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{shell?.owner.displayName}</span>
            <span className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
              {shell ? `${shell.accountCount} tài khoản` : ''}
            </span>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tài khoản Sino của bạn">
            <Ellipsis strokeWidth={1.6} />
          </Button>
        </div>
      </div>
    </aside>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <span className="px-3 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-semibold tracking-[0.06em] text-subtle-foreground">
      {children}
    </span>
  )
}

function SidebarLink({ item, shell }: { item: NavItem; shell: ShellData | undefined }) {
  const { value, spoken } = badgeOf(item.label, item.count, shell?.navCounts)
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      className="group flex h-11 shrink-0 items-center gap-3 rounded-sm border border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-border aria-[current=page]:bg-raised aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
    >
      <Icon
        className="size-4.5 shrink-0 transition-transform duration-(--dur-hover) ease-out group-hover:translate-x-0.5"
        strokeWidth={1.6}
      />
      <span>{item.label}</span>
      {value > 0 && (
        <>
          <span
            aria-hidden="true"
            className="ml-auto font-mono text-xs font-medium text-muted-foreground group-aria-[current=page]:text-foreground"
          >
            {value}
          </span>
          <span className="sr-only">{spoken}</span>
        </>
      )}
    </NavLink>
  )
}
