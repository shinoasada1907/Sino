import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { providerNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { ChatThread } from './components/ChatThread'
import { ConversationInfo } from './components/ConversationInfo'
import { ConversationList } from './components/ConversationList'
import { EmailThread } from './components/EmailThread'
import { SourcePane } from './components/SourcePane'
import { filterConversations, unreadLabel } from './format'
import { useConversation, useMarkRead } from './useInbox'
import { useInboxFilter } from './useInboxFilter'

/**
 * The Hộp thư screen (canvas `Inbox`): sources and filters, the conversation list, and an open email in the right
 * column. A chat is a page of its own from 1280px (canvas `Conversation`: chat and info column) and sits in the right
 * column on tablet. `/inbox/:conversationId` opens a conversation and marks it as read.
 */
export function InboxPage() {
  const { conversationId } = useParams()
  const { inbox, item, detail, notFound, receivedAt } = useConversation(conversationId ?? '')
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const navigate = useNavigate()
  const { filter, search, searchFor } = useInboxFilter(inbox?.providers.map((provider) => provider.type) ?? [])
  const markRead = useMarkRead()
  const { mutate: read } = markRead
  const unreadOpen = item !== undefined && item.unreadCount > 0

  // Opening a conversation reads it: the mutation updates the cache of every screen that counts unread messages.
  useEffect(() => {
    if (unreadOpen && conversationId) {
      read(conversationId)
    }
  }, [unreadOpen, conversationId, read])

  if (!inbox) {
    return (
      <p role="status" className="p-8 text-sm text-muted-foreground">
        Đang tải…
      </p>
    )
  }

  const nameOf = providerNameOf(inbox.providers)
  const selected = conversationId !== undefined
  const unread = filter.source
    ? (inbox.counts.byProvider.find((entry) => entry.provider === filter.source)?.unread ?? 0)
    : inbox.counts.unread
  const account = item && inbox.accounts.find((entry) => entry.id === item.accountId)
  const chat = item?.kind === 'CHAT' && account !== undefined

  return (
    <div
      className={cn(
        'grid h-full min-h-0 bg-background md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]',
        chat ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-[232px_400px_minmax(0,1fr)]',
      )}
    >
      <SourcePane inbox={inbox} filter={filter} searchFor={searchFor} nameOf={nameOf} className={chat ? 'hidden' : 'hidden xl:block'} />
      <ConversationList
        conversations={filterConversations(inbox.conversations, filter, now)}
        unread={unreadLabel(unread)}
        view={filter.view}
        onView={(view) => navigate({ search: searchFor({ view }) })}
        selectedId={conversationId ?? null}
        search={search}
        now={now}
        nameOf={nameOf}
        className={chat ? 'hidden md:block xl:hidden' : selected ? 'hidden md:block' : undefined}
      />
      {chat && item && account ? (
        <>
          <ChatThread key={item.id} item={item} detail={detail} account={account} backSearch={search} now={now} nameOf={nameOf} />
          <ConversationInfo key={`info-${item.id}`} item={item} detail={detail} account={account} now={now} nameOf={nameOf} className="hidden min-h-0 xl:grid" />
        </>
      ) : (
        <section
          aria-label="Cuộc trò chuyện đang mở"
          className={cn(
            'min-h-0 min-w-0',
            item && account ? 'grid grid-rows-[auto_minmax(0,1fr)_auto]' : 'grid place-items-center',
            !selected && 'hidden md:grid',
          )}
        >
          {!selected && <p className="text-sm text-muted-foreground">Chọn một cuộc trò chuyện để đọc.</p>}
          {selected && notFound && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-base">Không tìm thấy cuộc trò chuyện này.</p>
              <Button asChild variant="secondary" size="sm">
                <Link to="/inbox">Về hộp thư</Link>
              </Button>
            </div>
          )}
          {item && account && <EmailThread key={item.id} item={item} detail={detail} account={account} now={now} nameOf={nameOf} />}
        </section>
      )}
    </div>
  )
}
