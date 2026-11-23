import { useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import type { MessageContactCard } from '../inbox.types'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  if (parts.length === 1) {
    return Array.from(parts[0]!).slice(0, 2).join('').toUpperCase()
  }
  return `${Array.from(parts[0]!)[0] ?? ''}${Array.from(parts[parts.length - 1]!)[0] ?? ''}`.toUpperCase()
}

function telHref(phone: string | null): string | null {
  if (!phone) {
    return null
  }
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

/**
 * Contact card inside a chat bubble (zalo-location-card, D-531): follows Zalo desktop's layout in Sino's Sunset
 * theme, sharing the bubble frame of `LocationCard`. Top: avatar (or initials), plain-text name, and optional QR image
 * on the right. Bottom: equal-width "Gọi Điện" (`tel:`) and "Nhắn Tin" (`/messages/<conversationId>`) actions, each
 * shown only when its target is present (no dead buttons, no phone number printed as text).
 */
export function ContactCard({ contactCard, own }: { contactCard: MessageContactCard; own: boolean }) {
  const [brokenQr, setBrokenQr] = useState(false)
  const callHref = telHref(contactCard.phone)
  const chatTo = contactCard.conversationId ? `/messages/${encodeURIComponent(contactCard.conversationId)}` : null
  const showQr = Boolean(contactCard.qrUrl && !brokenQr)
  const actionCount = (callHref ? 1 : 0) + (chatTo ? 1 : 0)

  const actionClass = cn(
    'flex h-10 items-center justify-center px-3 text-xs leading-4 font-semibold transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
    own ? 'text-primary-foreground hover:bg-white/10' : 'text-foreground hover:bg-hover',
  )

  return (
    <div
      data-slot="contact-card"
      className={cn(
        'flex w-72 max-w-full flex-col overflow-hidden rounded-[20px] text-left transition-colors',
        own
          ? 'rounded-br-[8px] bg-primary text-primary-foreground'
          : 'rounded-bl-[8px] bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3.5">
        <Avatar
          src={contactCard.avatarUrl}
          className={cn('size-11 shrink-0', own ? 'border border-primary-foreground/25 bg-primary-foreground/15' : 'border border-border bg-surface')}
        >
          {!contactCard.avatarUrl && (
            <span className={cn('grid size-full place-items-center text-xs font-semibold uppercase select-none', own ? 'text-primary-foreground' : 'text-muted-foreground')}>
              {initialsOf(contactCard.name)}
            </span>
          )}
        </Avatar>

        <div className="min-w-0 flex-1 pt-0.5">
          <span className="block text-sm leading-snug font-semibold break-words">{contactCard.name}</span>
        </div>

        {showQr && contactCard.qrUrl && (
          <img
            src={contactCard.qrUrl}
            alt={`Mã QR của ${contactCard.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBrokenQr(true)}
            className="mt-2 size-16 shrink-0 rounded-md bg-white p-1 object-contain shadow-xs"
          />
        )}
      </div>

      {actionCount > 0 && (
        <div
          data-slot="contact-card-actions"
          className={cn(
            'grid divide-x',
            actionCount === 2 ? 'grid-cols-2' : 'grid-cols-1',
            own
              ? 'divide-primary-foreground/15 border-t border-primary-foreground/15 bg-black/10'
              : 'divide-border border-t border-border bg-surface',
          )}
        >
          {callHref && (
            <a href={callHref} onClick={(event) => event.stopPropagation()} className={actionClass}>
              Gọi Điện
            </a>
          )}
          {chatTo && (
            <Link to={chatTo} onClick={(event) => event.stopPropagation()} className={actionClass}>
              Nhắn Tin
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
