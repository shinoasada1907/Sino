import { Clock, Info } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, type To } from 'react-router'
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
import { NicknameDialog } from './components/NicknameDialog'
import { FirstSyncCard, ListSkeleton, LoadFailed, NoSources, OfflineBanner, RealtimeBanner, ThreadSkeleton } from './components/InboxStates'
import { canSetNickname, displayName, FOLDERS, failureDetail, failureReason, matchesAccountAndChat, mobileThreadSubtitle, accountCounts, countsFor, unreadLabel } from './format'
import { useConversation, useConversationList, useInbox, useUpdateConversation } from './useInbox'
import { useInboxFilter } from './useInboxFilter'
import { useNewMailNotice } from './useNewMailNotice'
import { SCREENS, screenFrame } from './screen'

// The list and the info column are floating cards 12 px from the edge (canvas `.pane`); the thread is not a card, it sits on the page (`.main`).
const CARD = 'md:rounded-panel md:bg-surface md:shadow-card'

/**
 * Tin nhắn (`/messages`, chats; canvas `Messages`) and Hộp thư (`/inbox`, emails; canvas `Inbox`), one screen per kind
 * of provider (f05c, D-300).
 * In Hộp thư (`EMAIL`), accounts are managed in the main Sidebar, so the page is streamlined into a sleek 2-column layout:
 * Left column: Conversation list with category tabs, quick toolbar, and attachment pills.
 * Right column: Rich email reading pane and quick reply card.
 */
export function InboxPage({ kind, compose = false }: { kind: ProviderKind; compose?: boolean }) {
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
  const { filter, search, searchFor } = useInboxFilter(validAccounts, kind)
  const list = useConversationList(kind, filter, now)
  // The notice counts the account being watched only; mail of another one moves its number in the account column (D-433).
  const notice = useNewMailNotice(filter.account ? [filter.account] : (inbox?.accounts.map((account) => account.id) ?? []))

  const conversations = list.conversations
  const [showInfo, setShowInfo] = useState(false)
  // The conversation whose "Đặt biệt danh" box is open; opening another conversation closes it.
  const [nicknameFor, setNicknameFor] = useState<string | null>(null)

  const opened = useConversation(
    conversationId,
    list.loaded.find((conversation) => conversation.id === conversationId),
    kind,
  )
  const { item: found, detail, notFound } = opened
  const { mutate: update } = useUpdateConversation()
  // A conversation of the other kind (an old link, D-303) moves to its screen before anything of it shows or is read.
  const elsewhere = found && found.kind !== kind ? found : undefined
  const item = elsewhere ? undefined : found
  // The address of another copy of a thread opens the thread under its own ID (f05b, D-183); it is read there.
  const canonicalId = item && item.id !== conversationId ? item.id : null
  const unreadOpen = item !== undefined && canonicalId === null && item.unreadCount > 0
  // Esc closes the info of the chat, unless a dialog (a nickname, a picture) has it first.
  useEffect(() => {
    if (!showInfo) {
      return
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) {
        setShowInfo(false)
      }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [showInfo])
  const online = useOnline()
  const realtimeDown = useRealtimeDown()
  const readOnce = useRef<string | null>(null)
  const readMarker = item && canonicalId === null ? `${conversationId}@${item.lastMessageAt}` : null

  // Opening a conversation reads it, and a new message arriving while it is open reads it again — once per lastMessageAt,
  // so marking unread or a failed read does not trigger another PATCH.
  useEffect(() => {
    if (!conversationId) {
      readOnce.current = null
    } else if (readMarker && readOnce.current !== readMarker) {
      readOnce.current = readMarker
      if (unreadOpen) {
        update({ id: conversationId, change: { read: true } })
      }
    }
  }, [unreadOpen, conversationId, readMarker, update])

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

  const nameOf = providerNameOf(inbox?.providers ?? [])
  // Where the list goes for a change of filter: an open conversation the new filter leaves out closes, back to the list (D-434).
  const toFilter = (change: Partial<typeof filter>): To => {
    const stays = !item || matchesAccountAndChat(item, { ...filter, ...change })
    return stays ? { search: searchFor(change) } : { pathname: screen.path, search: searchFor(change) }
  }
  // The account column shows when no chat is open; an open chat gets the 64 px strip of MA-06 instead (D-437).
  const selected = conversationId !== undefined || compose
  const error = frameError ?? list.error
  const failedAt = frameFailedAt ?? list.failedAt

  // No sources yet on this screen: a placeholder takes its place
  if (inbox && inbox.accounts.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {!online && <OfflineBanner savedAt={receivedAt} />}
        {online && realtimeDown && <RealtimeBanner state={realtimeDown} />}
        <NoSources screen={screen} providers={inbox.providers} />
      </div>
    )
  }

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
  const wholeInbox = filter.view === 'all' && !filter.folder && filter.account === null && !filter.chatType
  const syncing =
    inbox && wholeInbox && conversations?.length === 0 && !list.switching ? inbox.accounts.filter((entry) => entry.syncProgress !== null) : []
  const folder = filter.folder ? FOLDERS[filter.folder] : null
  const unread = inbox ? countsFor(inbox.counts, filter.account).unread : 0
  const account = item && inbox?.accounts.find((entry) => entry.id === item.accountId)
  // Every account holding the open thread, the primary copy first (f05b, D-182).
  const threadAccounts = item && inbox ? item.accountIds.flatMap((id) => inbox.accounts.filter((entry) => entry.id === id)) : []
  const chat = item?.kind === 'CHAT' && account !== undefined
  const back = { to: `${screen.path}${search}`, label: `Quay lại ${folder?.title ?? screen.title}` }
  // The name is a button only in a 1-1 chat of a provider with nicknames (zalo-nicknames, D-420).
  const nicknamable = item !== undefined && inbox !== undefined && canSetNickname(item, inbox.providers)
  const editName = item && nicknamable ? () => setNicknameFor(item.id) : undefined
  const mobileHeader = item && (
    <MobilePageHeader
      back={back}
      title={displayName(item)}
      onTitle={editName && { label: `${displayName(item)}, đặt biệt danh`, open: editName }}
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

  // The unread count is the inbox's; a folder says nothing of it.
  let listMeta = folder ? '' : online ? unreadLabel(unread) : `${unreadLabel(unread)} · đã lưu`
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
          'grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)] md:gap-3 md:p-3 md:*:overflow-hidden',
          // The info of a chat opens over the chat (not a column of its own), so a chat gets the rest of the width.
          kind === 'CHAT' ? 'xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]' : 'xl:grid-cols-[380px_minmax(0,1fr)]',
        )}
      >
        <ConversationList
          screen={screen}
          conversations={conversations ?? []}
          unread={listMeta}
          total={inbox?.counts.unread ?? null}
          accountOptions={inbox ? accountCounts(inbox) : []}
          counts={inbox ? countsFor(inbox.counts, filter.account) : undefined}
          filter={filter}
          onFilter={(change) => navigate(toFilter(change))}
          selectedId={conversationId ?? null}
          search={search}
          now={now}
          accounts={inbox?.accounts ?? []}
          body={listBody}
          switching={list.switching}
          more={list.more}
          notice={notice}
          className={cn(selected ? 'hidden md:flex' : 'flex', CARD)}
        />
        {chat && item && account ? (
          <div className="relative flex min-h-0 min-w-0 flex-col *:nth-2:min-h-0 *:nth-2:flex-1">
            {mobileHeader}
            <ChatThread
              key={item.id}
              item={item}
              detail={detail}
              history={opened.history}
              account={account}
              backSearch={search}
              now={now}
              nameOf={nameOf}
              showInfo={showInfo}
              onToggleInfo={() => setShowInfo((prev) => !prev)}
              onEditName={editName}
            />
            {nicknamable && (
              <NicknameDialog item={item} open={nicknameFor === item.id} onOpenChange={(open) => setNicknameFor(open ? item.id : null)} />
            )}
            {/* Over the right edge of the chat, opened by "Thông tin", closed by its button or Esc (D-437). */}
            {showInfo && (
              <ConversationInfo
                key={`info-${item.id}`}
                item={item}
                detail={detail}
                account={account}
                now={now}
                nameOf={nameOf}
                onClose={() => setShowInfo(false)}
                className="absolute inset-y-0 right-0 z-10 hidden w-85 max-w-full border-l-0 xl:flex xl:rounded-panel xl:bg-surface xl:shadow-popover"
              />
            )}
          </div>
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
