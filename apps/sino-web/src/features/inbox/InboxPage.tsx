import { Clock, Info } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import type { ProviderKind } from '@/shared/domain'
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
import { FirstSyncCard, ListSkeleton, LoadFailed, OfflineBanner, RealtimeBanner, SourcesSkeleton, ThreadSkeleton } from './components/InboxStates'
import { SourcePane } from './components/SourcePane'
import { failureDetail, failureReason, mobileThreadSubtitle, sourceCounts, unreadLabel } from './format'
import { useConversation, useConversationList, useInbox, useUpdateConversation } from './useInbox'
import { useInboxFilter } from './useInboxFilter'
import { useNewMailNotice } from './useNewMailNotice'
import { SCREENS, screenFrame } from './screen'

/**
 * Tin nhắn (`/messages`, chats; canvas `Messages`) and Hộp thư (`/inbox`, emails; canvas `Inbox`), one screen per kind
 * of provider (f05c, D-300).
 * In Hộp thư (`EMAIL`), accounts are managed in the main Sidebar, so the page is streamlined into a sleek 2-column layout:
 * Left column: Conversation list with category tabs, quick toolbar, and attachment pills.
 * Right column: Rich email reading pane and quick reply card.
 */
export function InboxPage({ kind, compose = false }: { kind: ProviderKind; compose?: boolean }) {
  const isEmail = kind === 'EMAIL'
  const screen = SCREENS[kind]
  const { conversationId } = useParams()
  const { inbox: whole, receivedAt, error: frameError, failedAt: frameFailedAt, retry: retryFrame } = useInbox(kind)
  // The providers and accounts of this screen's kind; the counts of the frame are already those of the kind.
  const inbox = whole && screenFrame(whole, kind)
  const clock = useNow()
  // Data that arrives between two clock ticks is measured from its arrival, as in the top bar.
  const now = new Date(Math.max(clock.getTime(), receivedAt))
  const navigate = useNavigate()
  const validAccounts = inbox?.accounts.map((account) => account.id) ?? null
  const { filter, search, searchFor } = useInboxFilter(inbox ? inbox.providers.map((provider) => provider.type) : null, validAccounts)
  const list = useConversationList(kind, filter, now)
  const notice = useNewMailNotice(inbox?.accounts.map((account) => account.id) ?? [])

  const conversations = list.conversations
  // Default to selecting the first conversation on desktop if none selected
  const activeConversationId = conversationId ?? ((isEmail || kind === 'CHAT') && conversations && conversations.length > 0 ? conversations[0].id : undefined)
  const [showInfo, setShowInfo] = useState(true)

  const opened = useConversation(
    activeConversationId,
    list.loaded.find((conversation) => conversation.id === activeConversationId),
  )
  const { item: found, detail, notFound } = opened
  const { mutate: update } = useUpdateConversation()
  // A conversation of the other kind (an old link, D-303) moves to its screen before anything of it shows or is read.
  const elsewhere = found && found.kind !== kind ? found : undefined
  const item = elsewhere ? undefined : found
  // The address of another copy of a thread opens the thread under its own ID (f05b, D-183); it is read there.
  const canonicalId = item && item.id !== conversationId ? item.id : null
  const unreadOpen = item !== undefined && canonicalId === null && item.unreadCount > 0
  const online = useOnline()
  const realtimeDown = useRealtimeDown()
  const readOnce = useRef<string | null>(null)

  // Opening a conversation reads it, once per opening
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
      navigate({ pathname: `${screen.path}/${canonicalId}`, search }, { replace: true })
    }
  }, [canonicalId, screen.path, search, navigate])

  // The filter of this screen means nothing on the other one, so it is left behind.
  useEffect(() => {
    if (elsewhere) {
      navigate({ pathname: `${SCREENS[elsewhere.kind].path}/${elsewhere.id}` }, { replace: true })
    }
  }, [elsewhere, navigate])

  // Scope email to the first available account if no account is selected
  useEffect(() => {
    if (isEmail && !filter.account && validAccounts && validAccounts.length > 0) {
      navigate({ pathname: screen.path, search: searchFor({ account: validAccounts[0] }) }, { replace: true })
    }
  }, [isEmail, filter.account, validAccounts, screen.path, searchFor, navigate])

  const nameOf = providerNameOf(inbox?.providers ?? [])
  const selected = activeConversationId !== undefined
  const error = frameError ?? list.error
  const failedAt = frameFailedAt ?? list.failedAt
  const loading = (!inbox || !conversations) && !error
  const retry = () => {
    if (frameError) {
      retryFrame()
    }
    if (list.error) {
      list.retry()
    }
  }

  // The first sync of a new account
  const wholeInbox = filter.view === 'all' && filter.source === null
  const syncing =
    inbox && wholeInbox && conversations?.length === 0 && !list.switching ? inbox.accounts.filter((entry) => entry.syncProgress !== null) : []
  const unread = filter.account && inbox?.counts.byAccount?.[filter.account]
    ? inbox.counts.byAccount[filter.account].unread
    : filter.source
      ? (inbox?.counts.byProvider.find((entry) => entry.provider === filter.source)?.unread ?? 0)
      : (inbox?.counts.unread ?? 0)
  const account = item && inbox?.accounts.find((entry) => entry.id === item.accountId)
  // Every account holding the open thread, the primary copy first (f05b, D-182).
  const threadAccounts = item && inbox ? item.accountIds.flatMap((id) => inbox.accounts.filter((entry) => entry.id === id)) : []
  const chat = item?.kind === 'CHAT' && account !== undefined
  const back = { to: `${screen.path}${search}`, label: `Quay lại ${screen.title}` }
  const mobileHeader = item && (
    <MobilePageHeader
      back={back}
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
          'grid min-h-0 flex-1 md:grid-cols-[340px_minmax(0,1fr)]',
          isEmail
            ? 'xl:grid-cols-[430px_minmax(0,1fr)]'
            : chat
              ? showInfo
                ? 'xl:grid-cols-[340px_minmax(0,1fr)_340px]'
                : 'xl:grid-cols-[340px_minmax(0,1fr)]'
              : 'xl:grid-cols-[232px_400px_minmax(0,1fr)]',
        )}
      >
        {!isEmail && (inbox ? (
          <SourcePane inbox={inbox} filter={filter} searchFor={searchFor} nameOf={nameOf} className={chat ? 'hidden' : 'hidden xl:block'} />
        ) : (
          <SourcesSkeleton loading={loading} className="hidden xl:block" />
        ))}
        <ConversationList
          screen={screen}
          conversations={conversations ?? []}
          unread={listMeta}
          total={unread}
          sources={inbox ? sourceCounts(inbox, nameOf) : []}
          filter={filter}
          onFilter={(change) => navigate({ search: searchFor(change) })}
          selectedId={activeConversationId ?? null}
          search={search}
          now={now}
          nameOf={nameOf}
          accounts={inbox?.accounts ?? []}
          body={listBody}
          switching={list.switching}
          more={list.more}
          notice={notice}
          className={chat ? (selected ? 'hidden xl:flex' : 'flex') : selected ? 'hidden md:flex' : 'flex'}
        />
        {chat && item && account ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-col *:last:min-h-0 *:last:flex-1">
              {mobileHeader}
              <ChatThread
                key={item.id}
                item={item}
                detail={detail}
                account={account}
                backSearch={search}
                now={now}
                nameOf={nameOf}
                showInfo={showInfo}
                onToggleInfo={() => setShowInfo((prev) => !prev)}
              />
            </div>
            {showInfo && (
              <ConversationInfo
                key={`info-${item.id}`}
                item={item}
                detail={detail}
                account={account}
                now={now}
                nameOf={nameOf}
                onClose={() => setShowInfo(false)}
                className="hidden h-full min-h-0 xl:flex"
              />
            )}
          </>
        ) : compose ? (
          <div className="flex min-h-0 min-w-0 flex-col">
            <MobilePageHeader back={back} title="Thư mới" />
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
                    <Link to={screen.path}>{`Về ${screen.title.toLowerCase()}`}</Link>
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
