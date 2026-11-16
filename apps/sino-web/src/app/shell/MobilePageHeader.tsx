import { ChevronLeft, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

/**
 * The header of a sub-page on mobile (canvas `.mob-top.has-back`, e.g. `MobileAccounts`): back button, optional
 * picture (the avatars of `MobileConversation`), title, optional subtitle and action. Shown below 768 px only and stays at the top while the page scrolls; the route declares
 * `handle.mobilePageHeader` so the shell hides its own mobile top bar.
 */
export function MobilePageHeader({
  back,
  title,
  subtitle,
  media,
  action,
  onTitle,
}: {
  back: { to: string; label: string }
  title: string
  subtitle?: string
  media?: ReactNode
  action?: ReactNode
  /** Makes the title a button with a pencil (the nickname of a chat, `MobileNickname`); `label` is what a screen reader says. */
  onTitle?: { label: string; open: () => void }
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-15 items-center gap-2 border-b bg-background py-2 pr-2 pl-1 md:hidden">
      <Button asChild variant="ghost" size="icon">
        <Link to={back.to} aria-label={back.label}>
          <ChevronLeft strokeWidth={1.6} />
        </Link>
      </Button>
      {media}
      <div className="flex min-w-0 grow flex-col">
        <h1 className="truncate text-sm font-semibold">
          {onTitle ? (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={onTitle.label}
              title="Đặt biệt danh"
              onClick={onTitle.open}
              className="-mx-1 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <span className="truncate">{title}</span>
              <Pencil className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
            </button>
          ) : (
            title
          )}
        </h1>
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
