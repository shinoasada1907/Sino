import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

/**
 * The header of a sub-page on mobile (canvas `.mob-top.has-back`, e.g. `MobileAccounts`): back button, title,
 * optional subtitle and action. Shown below 768 px only and stays at the top while the page scrolls; the route declares
 * `handle.mobilePageHeader` so the shell hides its own mobile top bar.
 */
export function MobilePageHeader({
  back,
  title,
  subtitle,
  action,
}: {
  back: { to: string; label: string }
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-15 items-center gap-2 border-b bg-background py-2 pr-2 pl-1 md:hidden">
      <Button asChild variant="ghost" size="icon">
        <Link to={back.to} aria-label={back.label}>
          <ChevronLeft strokeWidth={1.6} />
        </Link>
      </Button>
      <div className="flex min-w-0 grow flex-col">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && (
          <span className="truncate font-mono text-[11px] leading-4 font-medium tracking-[0.02em] text-muted-foreground uppercase">
            {subtitle}
          </span>
        )}
      </div>
      {action}
    </header>
  )
}
