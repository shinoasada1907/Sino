import { Archive, ArchiveRestore, Calendar, ChevronLeft, Clock, Ellipsis, ExternalLink, Search, SquareCheck, StickyNote, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import { bubbleMeta, disconnectedSince, formatFileSize, memberPlaceholder, notArrivedSince, sendBlock, threadSubtitle, withDayLines } from '../format'
import type { ConversationDetail, ConversationItem, InboxAccount, LinkedKind, Member, Message } from '../inbox.types'
import { useConversationActions, useSendMessage } from '../useInbox'
import { Composer } from './Composer'
import { ConversationAvatars } from './ConversationAvatars'
import { LatestPreview } from './LatestPreview'
import { MailDot } from './icons'
import { ThreadNotice } from './ThreadNotice'
import { photoOf } from '../photo'
import { pictureOf, spriteOf } from '../sticker'
import { PhotoPicture } from './PhotoPicture'
import { StickerPicture } from './StickerPicture'

type ChatMessage = Message & { kind: 'MESSAGE' }

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string; name: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks', name: 'Task' },
  EVENT: { icon: Calendar, to: '/calendar', name: 'Lịch hẹn' },
  NOTE: { icon: StickyNote, to: '/notes', name: 'Ghi chú' },
}

/**
 * The chat column of the canvas `Conversation`: header with the way back to the inbox (a page of its own from 1280px),
 * the messages by day with the system lines and the unread line, and the message box, or a notice in its place when
 * the account cannot send (`ThreadState`, D-55). "Đánh dấu chưa đọc" and "Lưu trữ" change the conversation and go back
 * to the list (D-73); the other tools have no flow yet. Until the API returns messages (F06) the newest one shows as its
 * preview (D-71); the message box waits for the detail.
 * From 768 to 1279px the header keeps "Lưu trữ" and "Thêm thao tác", as the tablet thread of the canvas. Below 768px
 * the page header (canvas `MobileConversation`) replaces this header, and the messages use more width.
 */
export function ChatThread({
  item,
  detail,
  account,
  backSearch,
  now,
  nameOf,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: InboxAccount
  backSearch: string
  now: Date
  nameOf: ProviderNameOf
}) {
  // Reading the conversation clears its unread count at once; the line keeps the count it had when it opened.
  const [unreadAtOpen] = useState(item.unreadCount)
  const members = detail?.members ?? null
  const group = item.memberCount !== null
  const name = nameOf(item.provider)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sendMessage = useSendMessage(item.id)
  const placed = useRef(false)
  const messageCount = detail?.messages?.length ?? 0
  const block = sendBlock(account, detail?.canSend)
  const { markUnread, toggleArchive } = useConversationActions(item, backSearch)
  const expiredAt = account.status === 'AUTH_EXPIRED' ? account.statusChangedAt : null

  // Opening shows the unread line (or the newest message); every message added afterwards scrolls to the bottom.
  useEffect(() => {
    const body = bodyRef.current
    if (!body || messageCount === 0) {
      return
    }
    const unreadLine = placed.current ? null : body.querySelector<HTMLElement>('[data-slot="unread-line"]')
    body.scrollTop = unreadLine ? unreadLine.offsetTop - body.offsetTop - 24 : body.scrollHeight
    placed.current = true
  }, [messageCount])

  return (
    <section aria-label={`Cuộc trò chuyện ${item.title}`} className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] md:grid-rows-[auto_minmax(0,1fr)_auto] xl:border-r">
      <header className="hidden items-start justify-between gap-4 border-b md:flex md:px-5 md:py-4 xl:px-6 xl:py-5">
        <div className="flex min-w-0 flex-col gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-3 hidden self-start xl:inline-flex">
            <Link to={{ pathname: '/messages', search: backSearch }}>
              <ChevronLeft strokeWidth={1.6} />
              Tin nhắn
            </Link>
          </Button>
          <div className="flex items-center gap-3.5">
            <ConversationAvatars item={item} members={members} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate text-xl leading-7 font-semibold tracking-[-0.01em]">{item.title}</h1>
              <span className="truncate text-sm text-muted-foreground">{threadSubtitle(item, [account], nameOf)}</span>
            </div>
            {expiredAt && (
              <Status tone="err" className="ml-2 max-xl:hidden">
                {disconnectedSince(expiredAt, now)}
              </Status>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tool label="Tìm trong cuộc trò chuyện" icon={Search} className="max-xl:hidden" />
          <Tool label="Đánh dấu chưa đọc" icon={MailDot} className="max-xl:hidden" onClick={markUnread} />
          <Tool label={item.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'} icon={item.archived ? ArchiveRestore : Archive} onClick={toggleArchive} />
          <Tool label="Thêm thao tác" icon={Ellipsis} className="xl:hidden" />
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border max-xl:hidden" />
          <Button type="button" variant="secondary" size="sm" className="max-xl:hidden">
            <ExternalLink strokeWidth={1.6} />
            Mở trong {name}
          </Button>
        </div>
      </header>

      <div ref={bodyRef} className="flex min-h-0 flex-col gap-2.5 overflow-auto p-4 md:gap-3 md:p-5 xl:px-8 xl:py-6">
        {detail?.messages === null && <LatestPreview item={item} now={now} />}
        {withDayLines(detail?.messages ?? [], now).map(({ message, dayLine }) => {
          return (
            <Fragment key={message.id}>
              {dayLine && <span className="self-center pt-2 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground">{dayLine}</span>}
              {message.id === detail?.firstUnreadId && unreadAtOpen > 0 && (
                <div data-slot="unread-line" className="flex items-center gap-3 font-mono text-[11px] leading-4 font-medium text-foreground before:h-px before:grow before:bg-border-strong after:h-px after:grow after:bg-border-strong">
                  <span>{unreadAtOpen} tin chưa đọc</span>
                </div>
              )}
              {message.kind === 'SYSTEM' ? (
                <span className="self-center rounded-full border px-3 py-1 text-xs leading-4 font-medium text-muted-foreground">{message.text}</span>
              ) : (
                <Bubble message={message} showName={group} members={members} />
              )}
            </Fragment>
          )
        })}
        {expiredAt && detail && (
          <span className="self-center rounded-full border px-3 py-1 text-xs leading-4 font-medium text-muted-foreground">{notArrivedSince(expiredAt, now)}</span>
        )}
      </div>

      {block ? (
        <ThreadNotice block={block} kind={item.kind} providerName={name} account={account} />
      ) : detail ? (
        <Composer
          kind="CHAT"
          label={`Nhắn tin tới ${item.title}`}
          placeholder={`Nhắn tin tới ${item.title}…`}
          account={account.address}
          via={`${name} · ${account.address}`}
          onSend={sendMessage.send}
        />
      ) : null}
    </section>
  )
}

function Tool({ label, icon: Icon, className, onClick }: { label: string; icon: LucideIcon | typeof MailDot; className?: string; onClick?: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className={className} onClick={onClick}>
      <Icon strokeWidth={1.6} />
    </Button>
  )
}

function TextBubble({ own, children }: { own: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'border px-3.5 py-2.5 text-sm',
        own ? 'rounded-[16px_16px_6px_16px] border-primary bg-primary text-primary-foreground' : 'rounded-[16px_16px_16px_6px] bg-surface text-foreground',
      )}
    >
      {children}
    </div>
  )
}

// Canvas `.bubble-row`: someone else's message on the left with their picture (and name in a group), own on the right.
function Bubble({ message, showName, members }: { message: ChatMessage; showName: boolean; members: Member[] | null }) {
  const own = message.direction === 'OUT'
  const [brokenSticker, setBrokenSticker] = useState(false)
  const [brokenSprite, setBrokenSprite] = useState(false)
  const [photoStep, setPhotoStep] = useState<'FULL' | 'THUMB' | 'BROKEN'>('FULL')
  // A sticker that moves plays its sprite sheet; when that cannot load it shows the still picture, then the text.
  const still = brokenSticker ? null : pictureOf(message.sticker)
  const sprite = brokenSprite ? null : spriteOf(message.stickerSprite)
  // A photo shows its picture; when that cannot load it shows the thumbnail, then the text. Its caption stays (ZL-16).
  const photo = photoOf(message.image)
  const photoSrc = photoStep === 'FULL' ? photo?.url : photoStep === 'THUMB' ? photo?.thumbUrl : null
  return (
    <div className={cn('flex max-w-[84%] items-end gap-2.5 md:max-w-[68%]', own ? 'flex-row-reverse self-end' : 'self-start')}>
      {!own && <Avatar aria-hidden="true" placeholder={memberPlaceholder(message.sender, members)} className="size-7" />}
      <div className={cn('flex min-w-0 flex-col gap-1', own ? 'items-end' : 'items-start')}>
        {!own && showName && (
          <span data-slot="bubble-name" className="pl-0.5 text-xs leading-4 font-semibold text-muted-foreground">
            {message.sender}
          </span>
        )}
        {sprite || still ? (
          <StickerPicture still={still} sprite={sprite} onSpriteError={() => setBrokenSprite(true)} onStillError={() => setBrokenSticker(true)} />
        ) : photoSrc ? (
          <PhotoPicture src={photoSrc} onError={() => setPhotoStep(photoStep === 'FULL' && photo?.thumbUrl ? 'THUMB' : 'BROKEN')} />
        ) : (
          <TextBubble own={own}>{message.text}</TextBubble>
        )}
        {photo?.caption && <TextBubble own={own}>{photo.caption}</TextBubble>}
        {message.attachments.map((file) =>
          file.image ? (
            <div
              key={file.name}
              className="flex h-35 w-55 items-end rounded-[14px] md:h-45 md:w-70 border bg-[repeating-linear-gradient(135deg,var(--surface)_0_10px,var(--raised)_10px_20px)] p-3"
            >
              <Spec className="text-foreground">{['Ảnh', file.caption, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}</Spec>
            </div>
          ) : (
            <Spec key={file.name} className="text-foreground">
              {[file.name, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}
            </Spec>
          ),
        )}
        <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] leading-4 font-medium', message.status === 'FAILED' ? 'text-danger-ink' : 'text-muted-foreground')}>
          {message.status === 'SENDING' && <Clock className="size-3" strokeWidth={1.6} />}
          {bubbleMeta(message)}
        </span>
        {message.linked.map((linked) => {
          const { icon: Icon, to, name } = LINKED[linked.kind]
          return (
            <Link
              key={linked.title}
              to={to}
              className="inline-flex h-7 max-w-full items-center gap-2 rounded-full border bg-surface pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <span className="truncate">
                {name}: {linked.title}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
