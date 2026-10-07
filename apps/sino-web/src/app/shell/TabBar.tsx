import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { badgeOf, TAB_ITEMS } from './navItems'
import type { ShellData } from './shell.types'

// Mobile navigation (< 768 px), the canvas `TabBar`.
export function TabBar({ shell, className }: { shell: ShellData | undefined; className?: string }) {
  return (
    <nav
      data-slot="tabbar"
      aria-label="Điều hướng chính"
      className={cn('grid grid-cols-5 border-t bg-background px-2 pt-1.5 pb-5.5', className)}
    >
      {TAB_ITEMS.map((item) => {
        const count = badgeOf(item.label, item.count, shell?.navCounts)
        const alert = badgeOf(item.label, item.alert, shell?.navCounts)
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className="group relative flex min-h-13 flex-col items-center justify-center gap-1 rounded-sm text-[11px] leading-3.5 font-medium text-muted-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 hidden h-0.5 w-5.5 rounded-full bg-foreground group-aria-[current=page]:block"
            />
            <Icon className="size-5.5" strokeWidth={1.6} />
            <span>{item.label}</span>
            {count.value > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 left-[calc(50%+5px)] h-4 min-w-4.5 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 font-semibold text-primary-foreground"
              >
                {count.value}
              </span>
            )}
            {alert.value > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-1.5 left-[calc(50%+7px)] size-1.75 rounded-full shadow-[0_0_0_2px_var(--bg)]',
                  item.alert?.tone === 'danger' ? 'bg-danger' : 'bg-foreground',
                )}
              />
            )}
            <span className="sr-only">{count.spoken || alert.spoken}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
