import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { formatWhen } from '@/shared/time/local'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { awaitingText, conversationContext, sourceShares, type ProviderNameOf } from '../format'
import type { InboxConversation, InboxSummary } from '../overview.types'
import { Card, Hairline, NoData, Spec } from './Card'

// Canvas `Dashboard` "Hộp thư hợp nhất"; on mobile two conversations and a full-width button (`MobileDashboard`).
export function InboxCard({
  inbox,
  now,
  nameOf,
  className,
}: {
  inbox: InboxSummary | null
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  if (!inbox) {
    return (
      <Card surface="spotlight" title="Hộp thư hợp nhất" caps className={cn('gap-4.5', className)}>
        <NoData />
      </Card>
    )
  }

  return (
    <Card
      surface="spotlight"
      title="Hộp thư hợp nhất"
      caps
      meta={<Spec>{inbox.unreadCount} chưa đọc</Spec>}
      className={cn('gap-3 md:gap-4.5', className)}
    >
      <p className="text-xl leading-7 font-semibold tracking-[-0.01em] md:text-[28px] md:leading-9 md:tracking-[-0.018em]">
        {awaitingText(inbox.awaitingReplyCount)}
      </p>
      <div className="-mx-3 flex flex-col gap-0.5">
        {inbox.conversations.map((conversation, index) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            now={now}
            providerName={nameOf(conversation.provider)}
            className={index >= 2 ? 'hidden md:grid' : undefined}
          />
        ))}
      </div>
      <Hairline className="mt-auto hidden md:block" />
      <div className="hidden grid-cols-[minmax(0,1fr)_auto] items-end gap-8 md:grid">
        <div className="flex flex-col gap-2.5">
          {sourceShares(inbox.bySource).map((source) => (
            <div key={source.provider} className="grid grid-cols-[24px_96px_minmax(0,1fr)_32px] items-center gap-x-3">
              <span className="grid size-6 place-items-center rounded-[7px] border bg-raised text-foreground">
                <ProviderIcon provider={source.provider} className="size-3.5" />
              </span>
              <span className="text-sm">{nameOf(source.provider)}</span>
              <span
                role="img"
                aria-label={`${nameOf(source.provider)}: ${source.unreadCount} chưa đọc, ${source.percent}%`}
                className="block h-1.5 overflow-hidden rounded-full bg-hover"
              >
                <span className="block h-full rounded-full bg-foreground" style={{ width: `${source.percent}%` }} />
              </span>
              <span className="text-right font-mono text-xs leading-4 font-medium tabular-nums">{source.unreadCount}</span>
            </div>
          ))}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/inbox">
            Mở hộp thư
            <ChevronRight strokeWidth={1.6} />
          </Link>
        </Button>
      </div>
      <Button asChild variant="secondary" size="sm" className="md:hidden">
        <Link to="/inbox">Mở hộp thư</Link>
      </Button>
    </Card>
  )
}

function ConversationRow({
  conversation,
  now,
  providerName,
  className,
}: {
  conversation: InboxConversation
  now: Date
  providerName: string
  className?: string
}) {
  const unread = conversation.unreadCount > 0
  const context = conversationContext(conversation, providerName)

  return (
    <div
      className={cn(
        'grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-hover) ease-out hover:bg-hover',
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-[9px] border bg-raised text-foreground">
        <ProviderIcon provider={conversation.provider} className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm">
          <span className={unread ? 'font-bold' : 'font-medium'}>{conversation.title}</span>
          <span className="hidden md:inline"> · {context}</span>
        </span>
        <span className="truncate text-sm text-muted-foreground">
          <span className="md:hidden">{context}</span>
          <span className="hidden md:inline">{conversation.snippet}</span>
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <Spec className={unread ? 'text-foreground' : undefined}>{formatWhen(new Date(conversation.lastMessageAt), now)}</Spec>
        {conversation.unreadCount === 1 && <span aria-hidden="true" className="size-2 rounded-full bg-foreground" />}
        {conversation.unreadCount > 1 && (
          <span
            aria-hidden="true"
            className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-xs bg-primary px-2 font-mono text-[11px] leading-4 font-semibold text-primary-foreground"
          >
            {conversation.unreadCount}
          </span>
        )}
        {unread && <span className="sr-only">, {conversation.unreadCount} chưa đọc</span>}
      </div>
    </div>
  )
}
