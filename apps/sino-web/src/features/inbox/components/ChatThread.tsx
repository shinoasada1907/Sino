import {
  CheckCheck,
  ChevronLeft,
  Code2,
  Lock,
  Mic,
  PanelRight,
  Paperclip,
  Pin,
  Search,
  SendHorizontal,
  Smile,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import { bubbleMeta, disconnectedSince, formatFileSize, getInitials, memberAvatar, memberPlaceholder, notArrivedSince, sendBlock, withDayLines } from '../format'
import type { ConversationDetail, ConversationItem, InboxAccount, Member, Message } from '../inbox.types'
import { useSendMessage } from '../useInbox'
import { ConversationAvatars } from './ConversationAvatars'
import { LatestPreview } from './LatestPreview'
import { ThreadNotice } from './ThreadNotice'
import { photoOf } from '../photo'
import { pictureOf, spriteOf } from '../sticker'
import { stickerContentUrl } from '@/features/stickers/stickers.api'
import { outgoingFiles } from '../outgoingFiles'
import { useAttachmentTray } from '../useAttachmentTray'
import { MailFile } from './EmailThread'
import { PhotoPicture } from './PhotoPicture'
import { StickerPicture } from './StickerPicture'
import { mineOf, type ReactionKind } from '../reactions'
import { useReactToMessage } from '../useReactToMessage'
import { PREVIEW_SET, REACTIONS_PREVIEW } from '../reactionsPreview'
import { ReactionChips } from './ReactionChips'
import { ReactionPicker } from './ReactionPicker'
import { StickerPicker } from './StickerPicker'

type ChatMessage = Message & { kind: 'MESSAGE' }

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
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: InboxAccount
  backSearch: string
  now: Date
  nameOf: ProviderNameOf
  showInfo?: boolean
  onToggleInfo?: () => void
}) {
  const [unreadAtOpen] = useState(item.unreadCount)
  const members = detail?.members ?? null
  const group = item.memberCount !== null
  const name = nameOf(item.provider)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sendMessage = useSendMessage(item.id)
  const previewReactions = REACTIONS_PREVIEW && item.kind === 'CHAT' && detail !== undefined && detail.reactionSet === undefined
  const reacting = useReactToMessage(item.id, previewReactions)
  const tray = useAttachmentTray()
  const sendsFiles = detail?.canSendFiles === true
  const placed = useRef(false)
  const newest = detail?.messages?.at(-1)
  const newestId = newest?.id
  const newestIsOwn = newest?.kind === 'MESSAGE' && newest.direction === 'OUT'
  const atBottom = useRef(true)
  const block = sendBlock(account, detail?.canSend)
  const expiredAt = account.status === 'AUTH_EXPIRED' ? account.statusChangedAt : null

  const [inputText, setInputText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const handleSend = () => {
    if (tray.items.length > 0 && sendsFiles) {
      sendMessage.sendFiles(tray.items.map((i) => i.file), inputText.trim())
      tray.clear()
      setInputText('')
    } else if (inputText.trim()) {
      sendMessage.send(inputText.trim())
      setInputText('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const primaryAvatar = members?.[0]?.avatarUrl || item.avatarUrl

  return (
    <section
      aria-label={`Cuộc trò chuyện ${item.title}`}
      className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] md:border-r bg-background"
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
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon-sm" className="-ml-2 md:hidden">
            <Link to={{ pathname: '/messages', search: backSearch }}>
              <ChevronLeft className="size-5" strokeWidth={1.6} />
            </Link>
          </Button>
          <div className="relative shrink-0">
            {primaryAvatar ? (
              <img src={primaryAvatar} alt="" className="size-10 rounded-full object-cover border border-border/60" />
            ) : (
              <ConversationAvatars item={item} members={members} />
            )}
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base font-bold text-foreground leading-tight">{item.title}</h1>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>Đang hoạt động • {account.address || name}</span>
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleInfo}
            className={cn('size-8 cursor-pointer', showInfo && 'bg-hover text-foreground')}
            aria-label="Chi tiết hội thoại"
            title="Chi tiết hội thoại"
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
        className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4 md:p-6"
      >
        {detail?.messages === null && <LatestPreview item={item} now={now} />}
        {withDayLines(detail?.messages ?? [], now).map(({ message, dayLine }) => {
          return (
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
                  reactionSet={previewReactions ? PREVIEW_SET : (detail?.reactionSet ?? [])}
                  previewReactions={previewReactions}
                  reacting={reacting}
                />
              )}
            </Fragment>
          )
        })}
        {expiredAt && detail && (
          <span className="self-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">{notArrivedSince(expiredAt, now)}</span>
        )}
      </div>

      {/* Chat Composer matching screenshot */}
      {block ? (
        <ThreadNotice block={block} kind={item.kind} providerName={name} account={account} />
      ) : (
        <div className="flex flex-col border-t bg-background">
          {/* Main Input Row */}
          <div className="flex items-center gap-2 px-4 py-2.5">
            {/* Attachment Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title="Đính kèm tệp"
            >
              <Paperclip className="size-4" strokeWidth={1.6} />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) tray.add(Array.from(e.target.files))
                e.target.value = ''
              }}
            />

            {/* Sticker / Emoji Picker */}
            {detail?.canSendImages && (
              <StickerPicker onPick={sendMessage.sendSticker} focusAfterPick={inputRef} className="size-8 text-muted-foreground hover:text-foreground shrink-0" />
            )}
            {!detail?.canSendImages && (
              <Button type="button" variant="ghost" size="icon-sm" className="size-8 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer" title="Biểu cảm">
                <Smile className="size-4" strokeWidth={1.6} />
              </Button>
            )}

            {/* Text Input */}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              className="min-h-9 flex-1 rounded-lg border border-border/80 bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-border-strong focus:bg-background focus:ring-1 focus:ring-ring"
            />

            {/* Mic button */}
            <Button type="button" variant="ghost" size="icon-sm" className="size-8 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer" title="Tin nhắn thoại">
              <Mic className="size-4" strokeWidth={1.6} />
            </Button>

            {/* Send Pill Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim() && tray.items.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-xs"
            >
              <span>Gửi</span>
              <SendHorizontal className="size-3.5" />
            </button>
          </div>

          {/* Technical Status Footer */}
          <div className="flex items-center justify-between border-t border-border/40 px-4 py-1.5 font-mono text-[11px] text-muted-foreground bg-surface/30">
            <span className="flex items-center gap-1.5">
              <span>Định dạng: Markdown cơ bản</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>Mã hóa: Bật</span>
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3 text-muted-foreground" />
              <span>{name} Gateway</span>
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

function Bubble({
  message,
  showName: _showName,
  members,
  conversationAvatar,
  isGroup,
  sending: _sending,
  providerName: _providerName,
  reactionSet,
  previewReactions,
  reacting,
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
}) {
  const own = message.direction === 'OUT'
  const reactions = message.reactions ?? []
  const reactable = reactionSet.length > 0 && (message.canReact === true || previewReactions) && !message.local

  const [brokenLibrary, setBrokenLibrary] = useState(false)
  const [brokenSticker, setBrokenSticker] = useState(false)
  const [brokenSprite, setBrokenSprite] = useState(false)
  const [photoStep, setPhotoStep] = useState<'FULL' | 'THUMB' | 'BROKEN'>('FULL')

  const library = message.libraryStickerId && !brokenLibrary ? stickerContentUrl(message.libraryStickerId) : null
  const still = library ?? (brokenSticker ? null : pictureOf(message.sticker))
  const sprite = brokenSprite ? null : spriteOf(message.stickerSprite)
  const photo = photoOf(message.image)
  const preview = own && !photo && message.clientMessageId ? outgoingFiles.previewOf(message.clientMessageId) : null
  const photoSrc = preview ?? (photoStep === 'FULL' ? photo?.url : photoStep === 'THUMB' ? photo?.thumbUrl : null)
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
      {/* Header text with Sender + Time */}
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5', own ? 'flex-row-reverse' : 'flex-row')}>
        <span className="font-semibold text-foreground/90">{message.sender}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {new Date(message.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
      </div>

      {/* Bubble Content */}
      {fileOnly ? null : sprite || still ? (
        <StickerPicture still={still} sprite={library ? null : sprite} onSpriteError={() => setBrokenSprite(true)} onStillError={() => (library ? setBrokenLibrary(true) : setBrokenSticker(true))} />
      ) : photoSrc ? (
        <PhotoPicture src={photoSrc} onError={() => setPhotoStep(photoStep === 'FULL' && photo?.thumbUrl ? 'THUMB' : 'BROKEN')} />
      ) : (
        <div
          className={cn(
            'px-4 py-2.5 text-xs leading-relaxed max-w-xl transition-colors',
            own
              ? 'rounded-2xl rounded-tr-xs bg-foreground text-background font-normal shadow-xs'
              : 'rounded-2xl rounded-tl-xs bg-surface border border-border/80 text-foreground shadow-xs',
          )}
        >
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

          {!message.quoteTag && !message.codePayload && <p>{message.text}</p>}
        </div>
      )}

      {photo?.caption && (
        <div className={cn('px-4 py-2.5 text-xs leading-relaxed rounded-2xl', own ? 'bg-foreground text-background' : 'bg-surface border border-border/80 text-foreground')}>
          {photo.caption}
        </div>
      )}

      {/* Attachments */}
      {message.attachments.map((file) =>
        file.image && preview ? null : file.image ? (
          <div
            key={file.name}
            className="flex h-35 w-55 items-end rounded-[14px] md:h-45 md:w-70 border bg-[repeating-linear-gradient(135deg,var(--surface)_0_10px,var(--raised)_10px_20px)] p-3"
          >
            <Spec className="text-foreground">{['Ảnh', file.caption, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}</Spec>
          </div>
        ) : (
          <MailFile key={file.url ?? file.name} file={file} />
        ),
      )}

      <ReactionChips reactions={reactions} kinds={reactionSet} own={own} />

      {/* Outbound delivery status */}
      {own && (
        <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground mt-0.5">
          <CheckCheck className="size-3 text-emerald-500" />
          <span>Đã gửi qua Sino Ops</span>
        </div>
      )}

      {/* Inbound / other status */}
      {!own && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {bubbleMeta(message)}
        </span>
      )}
    </div>
  )

  return (
    <div className={cn('group/bubble flex max-w-[88%] md:max-w-[75%] items-start gap-2.5', own ? 'flex-row-reverse self-end' : 'self-start')}>
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
      {reactable ? (
        <ReactionPicker kinds={reactionSet} mine={mineOf(reactions)} own={own} onPick={(kind) => reacting.react(message.id, reactions, kind)}>
          {content}
        </ReactionPicker>
      ) : (
        content
      )}
    </div>
  )
}
