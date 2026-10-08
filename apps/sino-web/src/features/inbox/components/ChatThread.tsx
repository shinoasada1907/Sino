import { Archive, Calendar, ChevronLeft, Clock, ExternalLink, Search, SquareCheck, StickyNote, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { bubbleMeta, formatFileSize, memberPlaceholder, threadSubtitle, withDayLines } from '../format'
import type { ConversationDetail, ConversationItem, LinkedKind, Member, Message } from '../inbox.types'
import { useSendMessage } from '../useInbox'
import { Composer } from './Composer'
import { MailDot } from './icons'

type ChatMessage = Message & { kind: 'MESSAGE' }

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string; name: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks', name: 'Task' },
  EVENT: { icon: Calendar, to: '/calendar', name: 'Lịch hẹn' },
  NOTE: { icon: StickyNote, to: '/notes', name: 'Ghi chú' },
}

/**
 * The chat column of the canvas `Conversation`: header with the way back to the inbox (a page of its own from 1280px),
 * the messages by day with the system lines and the unread line, and the message box. The tools have no flow yet.
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
  account: { externalAccountId: string }
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
  const messageCount = detail?.messages.length ?? 0

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
    <section aria-label={`Cuộc trò chuyện ${item.title}`} className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] xl:border-r">
      <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div className="flex min-w-0 flex-col gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-3 hidden self-start xl:inline-flex">
            <Link to={{ pathname: '/inbox', search: backSearch }}>
              <ChevronLeft strokeWidth={1.6} />
              Hộp thư
            </Link>
          </Button>
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="flex shrink-0">
              {(group && members ? members.slice(0, 3) : [{ name: item.title }]).map((member, index) => (
                <Avatar
                  key={member.name}
                  placeholder={memberPlaceholder(member.name, members)}
                  className={cn('size-7 shadow-[0_0_0_2px_var(--bg)]', index > 0 && '-ml-2')}
                />
              ))}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate text-xl leading-7 font-semibold tracking-[-0.01em]">{item.title}</h1>
              <span className="truncate text-sm text-muted-foreground">{threadSubtitle(item, account, nameOf)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tool label="Tìm trong cuộc trò chuyện" icon={Search} />
          <Tool label="Đánh dấu chưa đọc" icon={MailDot} />
          <Tool label="Lưu trữ" icon={Archive} />
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <Button type="button" variant="secondary" size="sm">
            <ExternalLink strokeWidth={1.6} />
            Mở trong {name}
          </Button>
        </div>
      </header>

      <div ref={bodyRef} className="flex min-h-0 flex-col gap-3 overflow-auto px-8 py-6">
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
      </div>

      <Composer
        kind="CHAT"
        label={`Nhắn tin tới ${item.title}`}
        placeholder={`Nhắn tin tới ${item.title}…`}
        account={account.externalAccountId}
        via={`${name} · ${account.externalAccountId}`}
        onSend={(text) => sendMessage.mutate(text)}
      />
    </section>
  )
}

function Tool({ label, icon: Icon }: { label: string; icon: LucideIcon | typeof MailDot }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}>
      <Icon strokeWidth={1.6} />
    </Button>
  )
}

// Canvas `.bubble-row`: someone else's message on the left with their picture (and name in a group), own on the right.
function Bubble({ message, showName, members }: { message: ChatMessage; showName: boolean; members: Member[] | null }) {
  const own = message.direction === 'OUT'
  return (
    <div className={cn('flex max-w-[68%] items-end gap-2.5', own ? 'flex-row-reverse self-end' : 'self-start')}>
      {!own && <Avatar aria-hidden="true" placeholder={memberPlaceholder(message.sender, members)} className="size-7" />}
      <div className={cn('flex min-w-0 flex-col gap-1', own ? 'items-end' : 'items-start')}>
        {!own && showName && (
          <span data-slot="bubble-name" className="pl-0.5 text-xs leading-4 font-semibold text-muted-foreground">
            {message.sender}
          </span>
        )}
        <div
          className={cn(
            'border px-3.5 py-2.5 text-sm',
            own ? 'rounded-[16px_16px_6px_16px] border-primary bg-primary text-primary-foreground' : 'rounded-[16px_16px_16px_6px] bg-surface text-foreground',
          )}
        >
          {message.text}
        </div>
        {message.attachments.map((file) =>
          file.image ? (
            <div
              key={file.name}
              className="flex h-45 w-70 items-end rounded-[14px] border bg-[repeating-linear-gradient(135deg,var(--surface)_0_10px,var(--raised)_10px_20px)] p-3"
            >
              <Spec className="text-foreground">{['Ảnh', file.caption, formatFileSize(file.sizeBytes)].filter(Boolean).join(' · ')}</Spec>
            </div>
          ) : (
            <Spec key={file.name} className="text-foreground">
              {file.name} · {formatFileSize(file.sizeBytes)}
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
