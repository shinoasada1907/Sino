import {
  Calendar,
  ChevronLeft,
  Clock,
  Code2,
  ExternalLink,
  PanelRight,
  Pencil,
  Pin,
  Search,
  SquareCheck,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import { bubbleMeta, disconnectedSince, displayName, formatFileSize, getInitials, linkParts, memberAvatar, memberPlaceholder, notArrivedSince, sendBlock, threadSubtitle, withDayLines } from '../format'
import type { ConversationDetail, ConversationItem, InboxAccount, LinkedKind, Member, Message } from '../inbox.types'
import { useSendMessage } from '../useInbox'
import { ConversationAvatars } from './ConversationAvatars'
import { LatestPreview } from './LatestPreview'
import { ThreadNotice } from './ThreadNotice'
import { photoOf } from '../photo'
import { pictureOf, spriteOf } from '../sticker'
import { stickerContentUrl } from '@/features/stickers/stickers.api'
import { outgoingFiles } from '../outgoingFiles'
import { useAttachmentTray } from '../useAttachmentTray'
import { Composer } from './Composer'
import { extractClipboardFiles } from '../clipboard'
import { MailFile } from './EmailThread'
import { PhotoPicture } from './PhotoPicture'
import { StickerPicture } from './StickerPicture'
import { mineOf, type ReactionKind } from '../reactions'
import { useReactToMessage } from '../useReactToMessage'
import { PREVIEW_SET, REACTIONS_PREVIEW } from '../reactionsPreview'
import { ReactionChips } from './ReactionChips'
import { ReactionPicker } from './ReactionPicker'
import { MessageActions } from './MessageActions'
import { QuoteBlock } from './QuoteBlock'
import { quoteOf } from '../reply'
import type { Quote } from '../inbox.types'

type ChatMessage = Message & { kind: 'MESSAGE' }

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string; name: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks', name: 'Task' },
  EVENT: { icon: Calendar, to: '/calendar', name: 'Lịch hẹn' },
  NOTE: { icon: StickyNote, to: '/notes', name: 'Ghi chú' },
}

const BOTTOM_SLACK = 80
const nearBottom = (body: HTMLElement) => body.scrollHeight - body.scrollTop - body.clientHeight <= BOTTOM_SLACK

export function ChatThread({
  item,
  detail,
  account,
  backSearch,
  now,
  nameOf,
  showInfo,
  onToggleInfo,
  onEditName,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: InboxAccount
  backSearch: string
  now: Date
  nameOf: ProviderNameOf
  showInfo?: boolean
  onToggleInfo?: () => void
  /** Opens the "Đặt biệt danh" box; given only for a 1-1 chat of a provider with nicknames, so the name is a button there alone. */
  onEditName?: () => void
}) {
  const shownName = displayName(item)
  const [unreadAtOpen] = useState(item.unreadCount)
  const members = detail?.members ?? null
  const group = item.memberCount !== null
  const name = nameOf(item.provider)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sendMessage = useSendMessage(item.id)
  const previewReactions = REACTIONS_PREVIEW && item.kind === 'CHAT' && detail !== undefined && detail.reactionSet === undefined
  const reactionSet = detail?.reactionSet ?? (previewReactions ? PREVIEW_SET : [])
  const reacting = useReactToMessage(item.id)
  const [replyTarget, setReplyTarget] = useState<{ convId: string; quote: Quote } | null>(null)
  const replyingQuote = replyTarget?.convId === item.id ? replyTarget.quote : null

  const jumpToMessage = (messageId: string) => {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('bg-hover/60', 'transition-colors', 'duration-500')
      setTimeout(() => el.classList.remove('bg-hover/60'), 1500)
    }
  }
  const tray = useAttachmentTray()
  const block = sendBlock(account, detail?.canSend)
  const sendsFiles = detail?.canSendFiles !== false && !block
  const placed = useRef(false)
  const newest = detail?.messages?.at(-1)
  const newestId = newest?.id
  const newestIsOwn = newest?.kind === 'MESSAGE' && newest.direction === 'OUT'
  const atBottom = useRef(true)
  const expiredAt = account.status === 'AUTH_EXPIRED' ? account.statusChangedAt : null

  const handlePaste = (e: React.ClipboardEvent) => {
    // If paste occurred inside textarea or input, Composer handles it directly.
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
      return
    }
    const files = extractClipboardFiles(e.clipboardData)
    if (files.length > 0 && sendsFiles) {
      e.preventDefault()
      e.stopPropagation()
      tray.add(files)
    }
  }

  useEffect(() => {
    const body = bodyRef.current
    if (!body || newestId === undefined) return
    if (placed.current) {
      if (!newestIsOwn && !atBottom.current) return
      body.scrollTop = body.scrollHeight
    } else {
      const unreadLine = body.querySelector<HTMLElement>('[data-slot="unread-line"]')
      body.scrollTop = unreadLine ? unreadLine.offsetTop - body.offsetTop - 24 : body.scrollHeight
      placed.current = true
    }
    atBottom.current = nearBottom(body)
  }, [newestId, newestIsOwn])

  useEffect(() => () => outgoingFiles.releasePreviews(), [])

  const carriesFiles = (event: DragEvent) => sendsFiles && event.dataTransfer.types.includes('Files')

  return (
    <section
      aria-label={`Cuộc trò chuyện ${shownName}`}
      className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background"
      onPaste={handlePaste}
      onDragOver={(event) => {
        if (carriesFiles(event)) event.preventDefault()
      }}
      onDrop={(event) => {
        if (carriesFiles(event)) {
          event.preventDefault()
          tray.add(Array.from(event.dataTransfer.files))
        }
      }}
    >
      {/* Thread Header matching screenshot */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to={{ pathname: '/messages', search: backSearch }}>
              <ChevronLeft className="size-4 md:size-5" strokeWidth={1.6} />
              <span className="xl:hidden 2xl:inline">Tin nhắn</span>
            </Link>
          </Button>
          <div className="relative shrink-0">
            <ConversationAvatars item={item} members={members} />
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          </div>
          <div className="flex min-w-32 flex-col">
            <h1 className="truncate text-base font-bold text-foreground leading-tight">
              {onEditName ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${shownName}, đặt biệt danh`}
                  title="Đặt biệt danh"
                  onClick={onEditName}
                  className="-mx-1.5 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 font-[inherit] outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <span className="truncate">{shownName}</span>
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
                </button>
              ) : (
                shownName
              )}
            </h1>
            <span className="truncate text-xs text-muted-foreground mt-0.5">
              {threadSubtitle(item, [account], nameOf)}
            </span>
          </div>
          {expiredAt && (
            <Status tone="err" className="ml-2 max-xl:hidden">
              {disconnectedSince(expiredAt, now)}
            </Status>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" className="size-8 cursor-pointer" aria-label="Tìm trong cuộc trò chuyện" title="Tìm trong cuộc trò chuyện">
            <Search className="size-4" strokeWidth={1.6} />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="size-8 cursor-pointer" aria-label="Ghim hội thoại" title="Ghim hội thoại">
            <Pin className="size-4" strokeWidth={1.6} />
          </Button>
          <Button type="button" variant="secondary" size="sm" className="cursor-pointer text-xs">
            <ExternalLink className="size-3.5 mr-1" strokeWidth={1.6} />
            <span className="max-2xl:sr-only">Mở trong {name}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleInfo}
            className={cn('size-8 cursor-pointer', showInfo && 'bg-hover text-foreground')}
            aria-label="Thông tin"
            aria-pressed={showInfo}
            title="Thông tin"
          >
            <PanelRight className="size-4" strokeWidth={1.6} />
          </Button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={bodyRef}
        onScroll={(event) => {
          atBottom.current = nearBottom(event.currentTarget)
        }}
        onLoadCapture={(event) => {
          if (atBottom.current && event.target instanceof HTMLImageElement) {
            event.currentTarget.scrollTop = event.currentTarget.scrollHeight
          }
        }}
        className="flex min-h-0 flex-col gap-4 overflow-auto px-4 py-5 md:px-5 xl:px-6"
      >
        {detail?.messages === null && <LatestPreview item={item} now={now} />}
        {withDayLines(detail?.messages ?? [], now).map(({ message, dayLine }) => (
          <Fragment key={message.id}>
            {dayLine && (
              <div className="my-2 flex justify-center">
                <span className="rounded-full border border-border/70 bg-surface/80 px-3.5 py-1 font-mono text-[11px] font-medium text-muted-foreground shadow-xs">
                  {dayLine}
                </span>
              </div>
            )}
            {message.id === detail?.firstUnreadId && unreadAtOpen > 0 && (
              <div data-slot="unread-line" className="flex items-center gap-3 font-mono text-[11px] font-medium text-foreground before:h-px before:grow before:bg-border-strong after:h-px after:grow after:bg-border-strong my-1">
                <span>{unreadAtOpen} tin chưa đọc</span>
              </div>
            )}
            {message.kind === 'SYSTEM' ? (
              <span className="self-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">{message.text}</span>
            ) : (
              <Bubble
                message={message}
                showName={group}
                members={members}
                conversationAvatar={item.avatarUrl}
                isGroup={group}
                sending={sendMessage}
                providerName={name}
                reactionSet={reactionSet}
                previewReactions={previewReactions}
                reacting={reacting}
                onReply={detail?.canSend !== false ? (q) => setReplyTarget({ convId: item.id, quote: q }) : undefined}
                onJump={detail?.messages?.some((m) => m.id === message.quote?.messageId) ? jumpToMessage : undefined}
              />
            )}
          </Fragment>
        ))}
        {expiredAt && detail && (
          <span className="self-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">{notArrivedSince(expiredAt, now)}</span>
        )}
      </div>

      {/* Chat Composer */}
      {block ? (
        <ThreadNotice block={block} kind={item.kind} providerName={name} account={account} />
      ) : detail ? (
        <Composer
          kind="CHAT"
          label={`Nhắn tin tới ${shownName}`}
          placeholder={`Nhắn tin tới ${shownName}…`}
          account={account.address}
          via={`${name} · ${account.address}`}
          onSend={(text, quote) => {
            sendMessage.send(text, quote)
            setReplyTarget(null)
          }}
          onSendSticker={detail.canSendImages ? sendMessage.sendSticker : undefined}
          tray={sendsFiles ? tray : undefined}
          onSendFiles={
            sendsFiles
              ? (files, text, quote) => {
                sendMessage.sendFiles(files, text, quote)
                setReplyTarget(null)
              }
              : undefined
          }
          quote={replyingQuote ?? undefined}
          onCancelQuote={() => setReplyTarget(null)}
        />
      ) : null}
    </section>
  )
}

function getDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '')
  } catch {
    return urlStr
  }
}

function getYouTubeId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr)
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v')
    }
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1)
    }
  } catch {
    return null
  }
  return null
}

function LinkPreviewCard({ url, own }: { url: string; own: boolean }) {
  const domain = getDomain(url)
  const ytId = getYouTubeId(url)
  const isImageLink = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url)
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : isImageLink ? url : null
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group/link mt-2 flex max-w-sm flex-col overflow-hidden rounded-xl border text-left transition-all hover:opacity-95',
        own
          ? 'border-white/20 bg-white/10 text-background'
          : 'border-border/80 bg-background/80 text-foreground shadow-xs',
      )}
    >
      {thumbUrl && (
        <div className="relative aspect-video w-full overflow-hidden bg-black/20">
          <img src={thumbUrl} alt="" className="size-full object-cover transition-transform duration-200 group-hover/link:scale-105" />
        </div>
      )}
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="relative grid size-7 shrink-0 place-items-center rounded-md border border-border/40 bg-surface/80 p-0.5 overflow-hidden">
          <img
            src={faviconUrl}
            alt=""
            className="size-4 object-contain"
            onError={(e) => {
              ; (e.currentTarget as HTMLElement).style.display = 'none'
            }}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-[10px] uppercase tracking-wider opacity-70">{domain}</span>
          <span className="truncate text-xs font-semibold underline-offset-2 group-hover/link:underline">{url}</span>
        </div>
        <ExternalLink className="size-3.5 shrink-0 opacity-60 group-hover/link:opacity-100" strokeWidth={1.6} />
      </div>
    </a>
  )
}

function MessageText({ text, own }: { text: string; own: boolean }) {
  const lines = text.split('\n')
  const urls: string[] = []
  lines.forEach((l) => {
    linkParts(l).forEach((p) => {
      if (p.href && !urls.includes(p.href)) {
        urls.push(p.href)
      }
    })
  })

  return (
    <div className="space-y-1">
      <div className="space-y-0.5">
        {lines.map((line, lineIdx) => (
          <p key={lineIdx} className="break-words">
            {linkParts(line).map((part, partIdx) =>
              part.href ? (
                <a
                  key={partIdx}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="underline underline-offset-3 decoration-current/40 hover:decoration-current hover:opacity-90 break-all transition-all font-medium text-inherit"
                >
                  {part.text}
                </a>
              ) : (
                <Fragment key={partIdx}>{part.text}</Fragment>
              ),
            )}
          </p>
        ))}
      </div>
      {urls.map((url) => (
        <LinkPreviewCard key={url} url={url} own={own} />
      ))}
    </div>
  )
}

function Bubble({
  message,
  showName,
  members,
  conversationAvatar,
  isGroup,
  sending,
  providerName,
  reactionSet,
  previewReactions,
  reacting,
  onReply,
  onJump,
}: {
  message: ChatMessage
  showName: boolean
  members: Member[] | null
  conversationAvatar: string | null
  isGroup: boolean
  sending: ReturnType<typeof useSendMessage>
  providerName: string
  reactionSet: ReactionKind[]
  previewReactions: boolean
  reacting: ReturnType<typeof useReactToMessage>
  onReply?: (quote: Quote) => void
  onJump?: (messageId: string) => void
}) {
  const own = message.direction === 'OUT'
  const reactions = message.reactions ?? []
  const reactable = (reactionSet.length > 0 || previewReactions) && message.canReact !== false && !message.local
  const isSticker = Boolean(message.sticker || message.stickerSprite || message.libraryStickerId)
  const canReply = !message.local && onReply !== undefined
  const canCopy = Boolean(message.text && !isSticker)

  const [brokenLibrary, setBrokenLibrary] = useState(false)
  const [brokenSticker, setBrokenSticker] = useState(false)
  const [brokenSprite, setBrokenSprite] = useState(false)
  const [photoStep, setPhotoStep] = useState<'FULL' | 'THUMB' | 'BROKEN'>('FULL')

  const library = message.libraryStickerId && !brokenLibrary ? stickerContentUrl(message.libraryStickerId) : null
  const still = library ?? (brokenSticker ? null : pictureOf(message.sticker))
  const sprite = brokenSprite ? null : spriteOf(message.stickerSprite)
  const photo = photoOf(message.image)
  const imageAttachment = message.attachments.find((a) => a.image)
  const preview = own && !photo && message.clientMessageId ? outgoingFiles.previewOf(message.clientMessageId) : null
  const photoSrc =
    preview ??
    (photoStep === 'FULL' ? photo?.url : photoStep === 'THUMB' ? photo?.thumbUrl : null) ??
    (imageAttachment?.url ?? null)
  const [onlyFile] = message.attachments
  const fileOnly = message.attachments.length === 1 && onlyFile !== undefined && !onlyFile.image && message.text === onlyFile.name

  // For 1-to-1 chats, the contact avatar is on the conversation (conversationAvatar) or other participant.
  // For group chats, look up by sender address/name in the member list or use direct message sender avatar.
  const avatar =
    (!isGroup ? (members?.find((m) => !m.self)?.avatarUrl || conversationAvatar) : null) ||
    message.senderAvatar ||
    memberAvatar(message.sender, members, message.senderAddress)

  const content = (
    <div className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}>
      {!own && showName && (
        <span data-slot="bubble-name" className="pl-0.5 text-xs leading-4 font-semibold text-muted-foreground">
          {message.sender}
        </span>
      )}

      {/* Bubble Content */}
      {fileOnly ? null : sprite || still ? (
        <StickerPicture still={still} sprite={library ? null : sprite} onSpriteError={() => setBrokenSprite(true)} onStillError={() => (library ? setBrokenLibrary(true) : setBrokenSticker(true))} />
      ) : photoSrc ? (
        <div className="flex flex-col gap-1.5">
          {message.quote && <QuoteBlock quote={message.quote} own={own} onJump={onJump} />}
          <PhotoPicture src={photoSrc} onError={() => setPhotoStep(photoStep === 'FULL' && photo?.thumbUrl ? 'THUMB' : 'BROKEN')} />
          {message.text && message.text !== '[Ảnh]' && message.text !== imageAttachment?.name && (
            <div
              className={cn(
                'px-4 py-2.5 text-xs leading-relaxed max-w-xl transition-colors',
                own
                  ? 'rounded-[20px] rounded-br-[8px] bg-primary text-primary-foreground font-normal'
                  : 'rounded-[20px] rounded-bl-[8px] bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
              )}
            >
              <MessageText text={message.text} own={own} />
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'px-4 py-2.5 text-xs leading-relaxed max-w-xl transition-colors',
            own
              ? 'rounded-[20px] rounded-br-[8px] bg-primary text-primary-foreground font-normal'
              : 'rounded-[20px] rounded-bl-[8px] bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
          )}
        >
          {message.quote && <QuoteBlock quote={message.quote} own={own} onJump={onJump} />}
          {message.quoteTag && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground border border-border/60">
                {message.quoteTag}
              </span>
              <span className="text-xs text-muted-foreground">{message.text}</span>
            </div>
          )}

          {message.codePayload && (
            <div className="mt-1.5 rounded-lg border border-border/80 bg-background/90 p-3 font-mono text-xs">
              <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border/60 font-semibold text-foreground">
                <Code2 className="size-3.5 text-muted-foreground" />
                <span>{message.codePayload.filename}</span>
              </div>
              <pre className="overflow-x-auto text-[11px] text-muted-foreground leading-relaxed whitespace-pre font-mono">
                {message.codePayload.content}
              </pre>
              {message.codePayload.note && (
                <p className="mt-2 text-[11px] text-muted-foreground pt-2 border-t border-border/40 font-sans">
                  {message.codePayload.note}
                </p>
              )}
            </div>
          )}

          {!message.quoteTag && !message.codePayload && <MessageText text={message.text} own={own} />}
        </div>
      )}

      {photo?.caption && (
        <div className={cn('px-4 py-2.5 text-xs leading-relaxed rounded-2xl', own ? 'bg-primary text-primary-foreground' : 'bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]')}>
          {photo.caption}
        </div>
      )}

      {/* Attachments */}
      {message.attachments.map((file) => {
        if (file.image) {
          if (photoSrc && (file.url === photoSrc || file.url === imageAttachment?.url || preview)) {
            return null
          }
          if (file.url) {
            return <PhotoPicture key={file.url} src={file.url} onError={() => { }} />
          }

          return (
            <div
              key={file.name}
              className="flex h-35 w-55 items-end rounded-[14px] md:h-45 md:w-70 border bg-[repeating-linear-gradient(135deg,var(--surface)_0_10px,var(--raised)_10px_20px)] p-3"
            >
              <Spec className="text-foreground">{['Ảnh', file.caption, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}</Spec>
            </div>
          )
        }
        return <MailFile key={file.url ?? file.name} file={file} />
      })}

      {/* Linked items */}
      {message.linked && message.linked.length > 0 && message.linked.map((linked) => {
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

      <ReactionChips reactions={reactions} kinds={reactionSet} own={own} />
      {reacting.failure && reacting.failure.messageId === message.id && (
        <p role="alert" className="text-xs leading-4 text-danger-ink animate-in fade-in-0 duration-200">
          {reacting.failure.text}
        </p>
      )}

      <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10px] leading-4 font-medium', message.status === 'FAILED' ? 'text-danger-ink' : 'text-muted-foreground')}>
        {message.status === 'SENDING' && <Clock className="size-3" strokeWidth={1.6} />}
        {bubbleMeta(message)}
      </span>
      {message.status === 'UNKNOWN' && (
        <p role="status" className="text-xs leading-4 text-muted-foreground">
          {message.local ? 'Mất kết nối khi gửi. Gửi lại không làm tin bị gửi hai lần.' : `Sino đang kiểm tra với ${providerName}.`}
        </p>
      )}
      {message.quoteRefused && (
        <p role="alert" className="text-xs leading-4 text-danger-ink">
          Không trả lời được tin này. Gửi lại sẽ không kèm trích dẫn.
        </p>
      )}
      {(message.status === 'FAILED' || (message.status === 'UNKNOWN' && message.local)) && message.clientMessageId && !sending.canResend(message) && (
        <p className="text-xs leading-4 text-muted-foreground">Chọn lại tệp để gửi.</p>
      )}
      {(message.status === 'FAILED' || (message.status === 'UNKNOWN' && message.local)) && message.clientMessageId && (
        <div className="flex flex-wrap gap-2">
          {sending.canResend(message) && (
            <Button type="button" variant="secondary" size="sm" onClick={() => sending.resend(message)}>
              Gửi lại
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => sending.discard(message)}>
            Bỏ
          </Button>
        </div>
      )}
      {sending.discardFailed !== undefined && sending.discardFailed === message.clientMessageId && (
        <p role="alert" className="text-xs leading-4 text-danger-ink">
          Không bỏ được tin này. Hãy thử lại.
        </p>
      )}
    </div>
  )

  return (
    <div
      data-message-id={message.id}
      className={cn(
        'group/bubble relative flex max-w-[88%] md:max-w-[64%] items-start gap-2.5',
        own ? 'flex-row-reverse self-end' : 'self-start',
      )}
    >
      {!own && (
        <div className="relative mt-1 shrink-0">
          <Avatar src={avatar} placeholder={memberPlaceholder(message.sender, members)} className="size-8">
            {!avatar && (
              <span className="grid size-full place-items-center font-semibold text-[11px] text-muted-foreground uppercase select-none">
                {getInitials(message.sender)}
              </span>
            )}
          </Avatar>
        </div>
      )}
      <div className={cn('flex items-center gap-1.5', own ? 'flex-row-reverse' : 'flex-row')}>
        {reactable ? (
          <ReactionPicker
            kinds={reactionSet}
            mine={mineOf(reactions)}
            own={own}
            reacted={reactions.length > 0}
            onPick={(kind) => reacting.react(message.id, reactions, kind)}
            onReply={canReply ? () => onReply(quoteOf(message)) : undefined}
            onCopy={canCopy ? () => void navigator.clipboard.writeText(message.text) : undefined}
          >
            {content}
          </ReactionPicker>
        ) : (
          content
        )}
        <MessageActions
          onReply={canReply ? () => onReply(quoteOf(message)) : undefined}
          onCopy={canCopy ? () => void navigator.clipboard.writeText(message.text) : undefined}
        />
      </div>
    </div>
  )
}
