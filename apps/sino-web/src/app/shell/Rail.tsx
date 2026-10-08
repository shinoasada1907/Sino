import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { SinoMark } from '@/shared/ui/sino-mark'
import { badgeOf, NAV_ITEMS, type NavItem } from './navItems'
import type { ShellData } from './shell.types'
import { UserMenu } from './UserMenu'

// Tablet navigation (768-1279 px), the canvas `Rail`: icons only, so every link carries an accessible name.
export function Rail({ shell, className }: { shell: ShellData | undefined; className?: string }) {
  const items = (group: NavItem['group']) =>
    NAV_ITEMS.filter((item) => item.group === group).map((item) => (
      <RailLink key={item.to} item={item} shell={shell} />
    ))

  return (
    <nav
      data-slot="rail"
      aria-label="Điều hướng chính"
      className={cn('flex-col items-center gap-1.5 overflow-y-auto border-r bg-background py-4', className)}
    >
      <span className="grid size-11 place-items-center text-foreground">
        <SinoMark className="size-5" />
      </span>
      <div className="mt-5 flex grow flex-col items-center gap-1.5">
        {items('main')}
        <Separator />
        {items('plan')}
        <Separator />
        {items('identity')}
      </div>
      {items('footer')}
      <UserMenu>
        <button
          type="button"
          aria-label="Tài khoản Sino của bạn"
          title={shell?.owner.displayName}
          className="mt-1.5 grid cursor-pointer place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <Avatar aria-hidden="true" />
        </button>
      </UserMenu>
    </nav>
  )
}

function Separator() {
  return <span aria-hidden="true" className="my-1 block h-px w-6 bg-border" />
}

function RailLink({ item, shell }: { item: NavItem; shell: ShellData | undefined }) {
  const { value, name } = badgeOf(item.label, item.alert, shell?.navCounts)
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      aria-label={name}
      title={item.label}
      className="relative grid size-11 shrink-0 place-items-center rounded-sm border border-transparent text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:border-border aria-[current=page]:bg-raised aria-[current=page]:text-foreground"
    >
      <Icon className="size-4.5" strokeWidth={1.6} />
      {value > 0 && item.alert && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-2.25 right-2.25 size-1.75 rounded-full shadow-[0_0_0_2px_var(--bg)]',
            item.alert.tone === 'danger' ? 'bg-danger' : 'bg-foreground',
          )}
        />
      )}
    </NavLink>
  )
}
