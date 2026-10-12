import { Clock, Info } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { providerNameOf } from '@/shared/format'
import { useOnline } from '@/shared/lib/useOnline'
import { useRealtimeDown } from '@/shared/realtime/useRealtimeDown'
import { cn } from '@/shared/lib/utils'
import { useNow } from '@/shared/time/useNow'
import { Button } from '@/shared/ui/button'
import { ChatThread } from './components/ChatThread'
import { ConversationAvatars } from './components/ConversationAvatars'
import { ConversationInfo } from './components/ConversationInfo'
import { ConversationList } from './components/ConversationList'
import { EmailThread } from './components/EmailThread'
import { NewMail } from './components/NewMail'
import { FirstSyncCard, ListSkeleton, LoadFailed, NoSources, OfflineBanner, RealtimeBanner, SourcesSkeleton, ThreadSkeleton } from './components/InboxStates'
import { SourcePane } from './components/SourcePane'
import { failureDetail, failureReason, mobileThreadSubtitle, sourceCounts, unreadLabel } from './format'
import { useConversation, useConversationList, useInbox, useUpdateConversation } from './useInbox'
import { useInboxFilter } from './useInboxFilter'
import { useNewMailNotice } from './useNewMailNotice'

/**
 * The Hộp thư screen (canvas `Inbox`): sources and filters, the conversation list, and an open email in the right
 * column. A chat is a page of its own from 1280px (canvas `Conversation`: chat and info column) and sits in the right
 * column on tablet. `/inbox/:conversationId` opens a conversation and marks it as read. Below 768px the list and an
 * open conversation are two screens (canvas `MobileInbox`, `MobileConversation`), each with its own header. The states
 * of `InboxState` (D-55): loading, first sync, cannot load, offline (above everything), no source yet (instead of it).
 * On the F05 API the server filters and pages the list; the frame (accounts, providers, counts) loads beside it.
 * `compose` (`/inbox/new`): the form of a new mail takes the place of an open conversation (f10-new-mail, D-191).
 */
export function InboxPage({ compose = false }: { compose?: boolean }) {
  const { conversationId } = useParams()
  const { inbox, receivedAt, error: frameError, failedAt: frameFailedAt, retry: retryFrame } = useInbox()
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const navigate = useNavigate()
  const { filter, search, searchFor } = useInboxFilter(inbox ? inbox.providers.map((provider) => provider.type) : null)
  const list = useConversationList(filter, now)
  const notice = useNewMailNotice()
  const opened = useConversation(
    conversationId,
    list.loaded.find((conversation) => conversation.id === conversationId),
  )
  const { item, detail, notFound } = opened
  const { mutate: update } = useUpdateConversation()
  // The address of another copy of a thread opens the thread under its own ID (f05b, D-183); it is read there.
  const canonicalId = item && item.id !== conversationId ? item.id : null
  const unreadOpen = item !== undefined && canonicalId === null && item.unreadCount > 0
  const online = useOnline()
  const realtimeDown = useRealtimeDown()
  const readOnce = useRef<string | null>(null)

  // Opening a conversation reads it, once per opening: marking it unread, or a refused read that puts the count back,
  // must not read it again while it stays open.
  useEffect(() => {
    if (!conversationId) {
      readOnce.current = null
    } else if (unreadOpen && readOnce.current !== conversationId) {
      readOnce.current = conversationId
      update({ id: conversationId, change: { read: true } })
    }
  }, [unreadOpen, conversationId, update])

  useEffect(() => {
    if (canonicalId) {
      navigate({ pathname: `/inbox/${canonicalId}`, search }, { replace: true })
    }
  }, [canonicalId, search, navigate])

  if (inbox && inbox.accounts.length === 0) {
    return <NoSources providers={inbox.providers} />
  }

  const nameOf = providerNameOf(inbox?.providers ?? [])
  const selected = conversationId !== undefined || compose
  const { conversations } = list
  const error = frameError ?? list.error
  const failedAt = frameError ? frameFailedAt : list.failedAt
  const loading = (!inbox || !conversations) && !error
  const retry = () => {
    if (frameError) {
      retryFrame()
    }
    if (list.error) {
      list.retry()
    }
  }
  // The first sync of a new account: nothing has arrived yet, so the list shows its progress instead of being empty. Only
  // the whole inbox tells that; an empty view or source is just empty.
  const wholeInbox = filter.view === 'all' && filter.source === null
  const syncing =
    inbox && wholeInbox && conversations?.length === 0 && !list.switching ? inbox.accounts.filter((entry) => entry.syncProgress !== null) : []
  const unread = filter.source
    ? (inbox?.counts.byProvider.find((entry) => entry.provider === filter.source)?.unread ?? 0)
    : (inbox?.counts.unread ?? 0)
  const account = item && inbox?.accounts.find((entry) => entry.id === item.accountId)
  // Every account holding the open thread, the primary copy first (f05b, D-182).
  const threadAccounts = item && inbox ? item.accountIds.flatMap((id) => inbox.accounts.filter((entry) => entry.id === id)) : []
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
  } else if (!inbox || !conversations) {
    listMeta = 'không tải được'
    listBody = <LoadFailed reason={failureReason(error)} detail={failureDetail(error, new Date(failedAt))} onRetry={retry} />
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
      {online && realtimeDown && <RealtimeBanner state={realtimeDown} />}
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
          conversations={conversations ?? []}
          unread={listMeta}
          total={inbox?.counts.unread ?? null}
          sources={inbox ? sourceCounts(inbox, nameOf) : []}
          filter={filter}
          onFilter={(change) => navigate({ search: searchFor(change) })}
          selectedId={conversationId ?? null}
          search={search}
          now={now}
          nameOf={nameOf}
          accounts={inbox?.accounts ?? []}
          body={listBody}
          switching={list.switching}
          more={list.more}
          notice={notice}
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
        ) : compose ? (
          <div className="flex min-h-0 min-w-0 flex-col">
            <MobilePageHeader back={{ to: `/inbox${search}`, label: 'Quay lại Hộp thư' }} title="Thư mới" />
            {inbox ? <NewMail accounts={inbox.accounts} search={search} /> : <ThreadSkeleton />}
          </div>
        ) : (
          <div className={cn('flex min-h-0 min-w-0 flex-col', !selected && 'hidden md:flex')}>
            {mobileHeader}
            <section
              aria-label="Cuộc trò chuyện đang mở"
              className={cn('grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]', item && account ? 'grid-rows-[auto_minmax(0,1fr)_auto]' : 'place-items-center')}
            >
              {!inbox && !loading && <p className="p-10 text-sm text-muted-foreground">Nội dung sẽ hiện ở đây khi hộp thư tải xong.</p>}
              {(loading || syncing.length > 0 || (inbox && selected && !item && !notFound && !opened.failed)) && <ThreadSkeleton />}
              {inbox && syncing.length === 0 && !selected && <p className="text-sm text-muted-foreground">Chọn một cuộc trò chuyện để đọc.</p>}
              {inbox && selected && !item && opened.failed && (
                <div role="alert" className="flex flex-col items-center gap-3">
                  <p className="text-base">Không mở được cuộc trò chuyện này.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={opened.retry}>
                    Thử lại
                  </Button>
                </div>
              )}
              {selected && notFound && syncing.length === 0 && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-base">Không tìm thấy cuộc trò chuyện này.</p>
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/inbox">Về hộp thư</Link>
                  </Button>
                </div>
              )}
              {item && account && (
                <EmailThread
                  key={item.id}
                  item={item}
                  detail={detail}
                  history={opened.history}
                  account={account}
                  accounts={threadAccounts}
                  backSearch={search}
                  now={now}
                  nameOf={nameOf}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
