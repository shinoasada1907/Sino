import { Clock, Info } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { useOnline } from '@/shared/lib/useOnline'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { ChatThread } from './components/ChatThread'
import { ConversationAvatars } from './components/ConversationAvatars'
import { ConversationInfo } from './components/ConversationInfo'
import { ConversationList } from './components/ConversationList'
import { EmailThread } from './components/EmailThread'
import { FirstSyncCard, ListSkeleton, LoadFailed, NoSources, OfflineBanner, SourcesSkeleton, ThreadSkeleton } from './components/InboxStates'
import { SourcePane } from './components/SourcePane'
import { failureDetail, filterConversations, mobileThreadSubtitle, sourceCounts, unreadLabel } from './format'
import { useConversation, useMarkRead } from './useInbox'
import { useInboxFilter } from './useInboxFilter'

/**
 * The Hộp thư screen (canvas `Inbox`): sources and filters, the conversation list, and an open email in the right
 * column. A chat is a page of its own from 1280px (canvas `Conversation`: chat and info column) and sits in the right
 * column on tablet. `/inbox/:conversationId` opens a conversation and marks it as read. Below 768px the list and an
 * open conversation are two screens (canvas `MobileInbox`, `MobileConversation`), each with its own header. The states
 * of `InboxState` (D-55): loading, first sync, cannot load, offline (above everything), no source yet (instead of it).
 */
export function InboxPage() {
  const { conversationId } = useParams()
  const { inbox, item, detail, notFound, receivedAt, error, failedAt, retry } = useConversation(conversationId ?? '')
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const navigate = useNavigate()
  const { filter, search, searchFor } = useInboxFilter(inbox?.providers.map((provider) => provider.type) ?? [])
  const markRead = useMarkRead()
  const { mutate: read } = markRead
  const unreadOpen = item !== undefined && item.unreadCount > 0
  const online = useOnline()

  // Opening a conversation reads it: the mutation updates the cache of every screen that counts unread messages.
  useEffect(() => {
    if (unreadOpen && conversationId) {
      read(conversationId)
    }
  }, [unreadOpen, conversationId, read])

  if (inbox && inbox.accounts.length === 0) {
    return <NoSources providers={inbox.providers} />
  }

  const nameOf = providerNameOf(inbox?.providers ?? [])
  const selected = conversationId !== undefined
  const loading = !inbox && !error
  // The first sync of a new account: nothing has arrived yet, so the list shows its progress instead of being empty.
  const syncing = inbox?.conversations.length === 0 ? inbox.accounts.filter((entry) => entry.syncProgress !== null) : []
  const unread = filter.source
    ? (inbox?.counts.byProvider.find((entry) => entry.provider === filter.source)?.unread ?? 0)
    : (inbox?.counts.unread ?? 0)
  const account = item && inbox?.accounts.find((entry) => entry.id === item.accountId)
  const chat = item?.kind === 'CHAT' && account !== undefined
  const mobileHeader = item && (
    <MobilePageHeader
      back={{ to: `/inbox${search}`, label: 'Quay lại Hộp thư' }}
      title={item.title}
      subtitle={mobileThreadSubtitle(item, nameOf)}
      media={item.kind === 'CHAT' ? <ConversationAvatars item={item} members={detail?.members ?? null} /> : undefined}
      action={
        <>
          <Button type="button" variant="ghost" size="icon" aria-label="Tạm ẩn">
            <Clock strokeWidth={1.6} />
          </Button>
          {item.kind === 'CHAT' && (
            <Button type="button" variant="ghost" size="icon" aria-label="Thông tin cuộc trò chuyện">
              <Info strokeWidth={1.6} />
            </Button>
          )}
        </>
      }
    />
  )

  let listMeta = online ? unreadLabel(unread) : `${unreadLabel(unread)} · đã lưu`
  let listBody: ReactNode
  if (loading) {
    listMeta = 'đang tải'
    listBody = <ListSkeleton label="Đang tải hộp thư" />
  } else if (!inbox) {
    listMeta = 'không tải được'
    listBody = <LoadFailed detail={failureDetail(error, new Date(failedAt))} onRetry={retry} />
  } else if (syncing.length > 0) {
    listMeta = 'đang đồng bộ'
    listBody = (
      <>
        <div className="flex flex-col gap-2.5 px-4 pt-4 pb-1">
          {syncing.map((entry) => (
            <FirstSyncCard key={entry.id} name={nameOf(entry.provider)} progress={entry.syncProgress ?? 0} />
          ))}
        </div>
        <ListSkeleton />
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {!online && <OfflineBanner savedAt={receivedAt} />}
      <div
        className={cn(
          'grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]',
          chat ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-[232px_400px_minmax(0,1fr)]',
        )}
      >
        {inbox ? (
          <SourcePane inbox={inbox} filter={filter} searchFor={searchFor} nameOf={nameOf} className={chat ? 'hidden' : 'hidden xl:block'} />
        ) : (
          <SourcesSkeleton loading={loading} className="hidden xl:block" />
        )}
        <ConversationList
          conversations={inbox ? filterConversations(inbox.conversations, filter, now) : []}
          unread={listMeta}
          total={inbox?.counts.unread ?? null}
          sources={inbox ? sourceCounts(inbox, nameOf) : []}
          filter={filter}
          onFilter={(change) => navigate({ search: searchFor(change) })}
          selectedId={conversationId ?? null}
          search={search}
          now={now}
          nameOf={nameOf}
          body={listBody}
          className={chat ? 'hidden md:flex xl:hidden' : selected ? 'hidden md:flex' : 'flex'}
        />
        {chat && item && account ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-col *:last:min-h-0 *:last:flex-1">
              {mobileHeader}
              <ChatThread key={item.id} item={item} detail={detail} account={account} backSearch={search} now={now} nameOf={nameOf} />
            </div>
            <ConversationInfo key={`info-${item.id}`} item={item} detail={detail} account={account} now={now} nameOf={nameOf} className="hidden min-h-0 xl:grid" />
          </>
        ) : (
          <div className={cn('flex min-h-0 min-w-0 flex-col', !selected && 'hidden md:flex')}>
            {mobileHeader}
            <section
              aria-label="Cuộc trò chuyện đang mở"
              className={cn('grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]', item && account ? 'grid-rows-[auto_minmax(0,1fr)_auto]' : 'place-items-center')}
            >
              {!inbox && !loading && <p className="p-10 text-sm text-muted-foreground">Nội dung sẽ hiện ở đây khi hộp thư tải xong.</p>}
              {(loading || syncing.length > 0) && <ThreadSkeleton />}
              {inbox && syncing.length === 0 && !selected && <p className="text-sm text-muted-foreground">Chọn một cuộc trò chuyện để đọc.</p>}
              {selected && notFound && syncing.length === 0 && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-base">Không tìm thấy cuộc trò chuyện này.</p>
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/inbox">Về hộp thư</Link>
                  </Button>
                </div>
              )}
              {item && account && <EmailThread key={item.id} item={item} detail={detail} account={account} now={now} nameOf={nameOf} />}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
