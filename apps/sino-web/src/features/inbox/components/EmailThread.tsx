import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Calendar,
  CalendarPlus,
  Clock,
  Ellipsis,
  ExternalLink,
  Search,
  SquareCheck,
  StickyNote,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { firstLine, formatFileSize, linkedMeta, mailTime, recipientsText, sendBlock, sendState, threadMeta, threadSubtitle } from '../format'
import type { Attachment, ConversationDetail, ConversationItem, InboxAccount, LinkedItem, LinkedKind, Message } from '../inbox.types'
import { useConversationActions, useSendMessage, type LoadMore, type MessageHistory } from '../useInbox'
import { Composer } from './Composer'
import { MailsSkeleton } from './InboxStates'
import { MailBody } from './MailBody'
import { LatestPreview } from './LatestPreview'
import { MailDot } from './icons'
import { ThreadNotice } from './ThreadNotice'

type Mail = Message & { kind: 'MESSAGE' }

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks' },
  EVENT: { icon: Calendar, to: '/calendar' },
  NOTE: { icon: StickyNote, to: '/notes' },
}

/**
 * An email thread in the right column of the canvas `Inbox`: header and tools, linked items, the older emails folded
 * (a click opens one), the newest in full with its attachments, and the reply box, or a notice in its place when the
 * account cannot send (`ThreadState`, D-55). "Đánh dấu chưa đọc" and "Lưu trữ" change the conversation and go back to
 * the list (D-73); the other tools have no flow yet (D-52). The emails come from the messages API (F06), newer pages
 * first: "Xem thư cũ hơn" loads the next one (D-124). A backend without that API leaves the preview of the newest email
 * (D-71), and so does a failure, with a line to try again; the reply box waits for the detail, which says whether Sino
 * can send.
 * From 768 to 1279px it keeps "Lưu trữ" and "Thêm thao tác" and drops the tools of each email (canvas `TabletInbox`);
 * below 768px it fills the screen under the page header, without the tools (no canvas for an email on a phone).
 */
export function EmailThread({
  item,
  detail,
  history,
  account,
  accounts,
  backSearch,
  now,
  nameOf,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  history: MessageHistory
  /** The account of the primary copy: replies go from it (f05b, D-186). */
  account: InboxAccount
  /** Every account holding the thread, the primary copy first (f05b, D-182). */
  accounts: InboxAccount[]
  /** The filter of the list to go back to after a change. */
  backSearch: string
  now: Date
  nameOf: ProviderNameOf
}) {
  const mails = (detail?.messages ?? []).filter((message): message is Mail => message.kind === 'MESSAGE')
  const newest = mails.at(-1)
  const [opened, setOpened] = useState<string[]>([])
  const toggle = (id: string) => setOpened((ids) => (ids.includes(id) ? ids.filter((open) => open !== id) : [...ids, id]))
  const sendMessage = useSendMessage(item.id)
  const sending: Sending = { ...sendMessage, providerName: nameOf(item.provider) }
  const block = sendBlock(account, detail?.canSend)
  const { markUnread, toggleArchive } = useConversationActions(item, backSearch)

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b p-4 md:px-5 xl:px-6 xl:py-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-lg leading-6.5 font-semibold tracking-[-0.01em] md:text-xl md:leading-7">{item.subject ?? item.title}</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* The mark stays beside the source: a thread in several accounts wraps its addresses next to it (f05b). */}
            <span className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-[7px] border bg-raised text-foreground">
                <ProviderIcon provider={item.provider} className="size-3.5" />
              </span>
              <span className="min-w-0 pt-0.5 text-sm text-muted-foreground">{threadSubtitle(item, accounts, nameOf)}</span>
            </span>
            {detail?.messages && <Spec>{threadMeta(detail.messages)}</Spec>}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Tool label="Tìm trong cuộc trò chuyện" icon={Search} className="max-xl:hidden" />
          <Tool label="Đánh dấu chưa đọc" icon={MailDot} className="max-xl:hidden" onClick={markUnread} />
          <Tool label={item.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'} icon={item.archived ? ArchiveRestore : Archive} onClick={toggleArchive} />
          <Tool label="Tạm ẩn" icon={Clock} className="max-xl:hidden" />
          <Tool label="Thêm thao tác" icon={Ellipsis} className="xl:hidden" />
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border max-xl:hidden" />
          <Button type="button" variant="secondary" size="sm" className="max-xl:hidden">
            <ExternalLink strokeWidth={1.6} />
            Mở trong {nameOf(item.provider)}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4 md:p-5 xl:p-6">
        {detail?.linked && detail.linked.length > 0 && <LinkedChips items={detail.linked} now={now} />}
        {history.loading || !detail ? (
          <MailsSkeleton />
        ) : history.failed ? (
          <>
            <MailsFailed onRetry={history.retry} />
            <LatestPreview item={item} now={now} later={false} />
          </>
        ) : detail.messages === null ? (
          <LatestPreview item={item} now={now} />
        ) : (
          <>
            {history.older.hasMore && <OlderMails older={history.older} />}
            {mails.map((mail) =>
              mail === newest ? (
                <MailCard key={mail.clientMessageId ?? mail.id} conversationId={item.id} mail={mail} now={now} sending={sending} tools />
              ) : opened.includes(mail.id) ? (
                <MailCard key={mail.clientMessageId ?? mail.id} conversationId={item.id} mail={mail} now={now} sending={sending} onFold={() => toggle(mail.id)} />
              ) : (
                <FoldedMail key={mail.id} mail={mail} now={now} onOpen={() => toggle(mail.id)} />
              ),
            )}
          </>
        )}
      </div>

      {block ? (
        <ThreadNotice block={block} kind={item.kind} providerName={nameOf(item.provider)} account={account} />
      ) : detail && !history.failed ? (
        // No box while the emails cannot load: a reply sent then would show nowhere.
        <Composer
          kind="EMAIL"
          label={`Trả lời ${item.title}`}
          placeholder={`Trả lời ${item.title}…`}
          account={account.address}
          via={`${nameOf(item.provider)} · ${account.address}`}
          to={detail.replyTo && detail.replyTo.length > 0 ? recipientsText(detail.replyTo) : undefined}
          onSend={sendMessage.send}
        />
      ) : null}
    </>
  )
}

function Tool({ label, icon: Icon, className, onClick }: { label: string; icon: LucideIcon | typeof MailDot; className?: string; onClick?: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className={className} onClick={onClick}>
      <Icon strokeWidth={1.6} />
    </Button>
  )
}

// No canvas: the emails could not load. The preview of the newest one follows.
function MailsFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-surface px-4 py-3">
      <TriangleAlert className="size-4 shrink-0 text-danger" strokeWidth={1.6} />
      <span className="min-w-0 grow text-sm">Không tải được các thư của cuộc trò chuyện này.</span>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}

// No canvas: the button above the emails that loads the older ones (D-124).
function OlderMails({ older }: { older: LoadMore }) {
  if (older.failed) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        Không tải được thư cũ hơn.
        <Button type="button" variant="secondary" size="sm" onClick={older.load}>
          Thử lại
        </Button>
      </div>
    )
  }
  return (
    <Button type="button" variant="ghost" size="sm" className="self-center" disabled={older.loading} onClick={older.load}>
      {older.loading ? 'Đang tải thư cũ hơn…' : 'Xem thư cũ hơn'}
    </Button>
  )
}

// Canvas `.linked` / `.lchip`: the tasks, appointments and notes made from this conversation.
function LinkedChips({ items, now }: { items: LinkedItem[]; now: Date }) {
  return (
    <div aria-label="Việc và ghi chú của cuộc trò chuyện này" className="flex flex-wrap gap-2">
      {items.map((linked) => {
        const { icon: Icon, to } = LINKED[linked.kind]
        const meta = linkedMeta(linked, now)
        return (
          <Link
            key={linked.id}
            to={to}
            className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border bg-surface pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
            <span className="truncate">{linked.title}</span>
            {meta && <Spec className="truncate">{meta}</Spec>}
          </Link>
        )
      })}
    </div>
  )
}

const placeholderOf = (mail: Mail) => (mail.direction === 'OUT' ? 'a' : 'c')

// Canvas `.mail.is-collapsed`: a folded older email is one button that opens it.
function FoldedMail({ mail, now, onOpen }: { mail: Mail; now: Date; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={onOpen}
      className="grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md border px-4 py-3 text-left transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <Avatar placeholder={placeholderOf(mail)} className="size-8" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">{mail.sender}</span>
        <span className="truncate text-sm text-muted-foreground">{firstLine(mail.text)}</span>
      </span>
      {/* An own email that did not go keeps saying so once a newer one folds it. */}
      <Spec className={mail.status === 'FAILED' ? 'text-danger-ink' : undefined}>
        {[mailTime(mail.at, now, undefined, false), mail.status === 'FAILED' || mail.status === 'UNKNOWN' ? sendState(mail) : null]
          .filter(Boolean)
          .join(' · ')}
      </Spec>
    </button>
  )
}

// What an own email needs when it did not go: send it again, throw it away, and whom Sino asks when it does not know.
type Sending = Pick<ReturnType<typeof useSendMessage>, 'resend' | 'discard' | 'discardFailed'> & { providerName: string }

// Canvas `.mail`: an open email; the newest carries the tools of the canvas, an older one folds back on its header.
function MailCard({
  conversationId,
  mail,
  now,
  sending,
  tools = false,
  onFold,
}: {
  conversationId: string
  mail: Mail
  now: Date
  sending: Sending
  tools?: boolean
  onFold?: () => void
}) {
  const head = (
    <>
      <Avatar placeholder={placeholderOf(mail)} className="size-8" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{mail.sender}</span>
        {mail.to && <Spec className="truncate">tới {mail.to}</Spec>}
      </span>
    </>
  )
  // "Chưa rõ đã gửi chưa" is too long beside the tools of the newest email; it goes under the text instead.
  const state = mail.status === 'UNKNOWN' ? null : sendState(mail)
  const time = (
    <Spec className={state === 'Không gửi được' ? 'text-danger-ink' : 'text-foreground'}>
      {[mailTime(mail.at, now, undefined, true), state].filter(Boolean).join(' · ')}
    </Spec>
  )

  return (
    <article className="flex flex-col gap-4 rounded-md border bg-surface p-4 md:p-5">
      {onFold ? (
        <button
          type="button"
          aria-expanded={true}
          onClick={onFold}
          className="grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {head}
          {time}
        </button>
      ) : (
        <div className={cn('grid items-center gap-x-3', tools ? 'grid-cols-[32px_minmax(0,1fr)_auto_auto]' : 'grid-cols-[32px_minmax(0,1fr)_auto]')}>
          {head}
          {tools && (
            <div role="toolbar" aria-label="Thao tác với thư này" className="mr-2.5 flex gap-0.5 rounded-[10px] max-xl:hidden border bg-raised p-0.75">
              <MailTool label="Tạo task" icon={SquareCheck} />
              <MailTool label="Nhắc tôi" icon={AlarmClock} />
              <MailTool label="Lịch hẹn" icon={CalendarPlus} />
              <MailTool label="Ghi chú" icon={StickyNote} />
            </div>
          )}
          {time}
        </div>
      )}
      <MailBody conversationId={conversationId} mail={mail} />
      {mail.status === 'UNKNOWN' && (
        <p role="status" className="text-sm text-muted-foreground">
          {sendState(mail)} ·{' '}
          {mail.local ? 'Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần.' : `Sino đang kiểm tra với ${sending.providerName}.`}
        </p>
      )}
      {(mail.status === 'FAILED' || (mail.status === 'UNKNOWN' && mail.local)) && mail.clientMessageId && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => sending.resend(mail)}>
            Gửi lại
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => sending.discard(mail)}>
            Bỏ
          </Button>
        </div>
      )}
      {sending.discardFailed !== undefined && sending.discardFailed === mail.clientMessageId && (
        <p role="alert" className="text-sm text-danger-ink">
          Không bỏ được thư này. Hãy thử lại.
        </p>
      )}
      {mail.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {mail.attachments.map((file, index) => (
            <MailFile key={file.url ?? `${file.name}-${index}`} file={file} />
          ))}
        </div>
      )}
    </article>
  )
}

// Canvas `.att`: a file of an email. From the API it downloads through Sino (D-125); the sample data has no address.
function MailFile({ file }: { file: Attachment }) {
  const className =
    'inline-flex h-13 min-w-0 max-w-full cursor-pointer items-center gap-2.5 rounded-sm border bg-raised pr-3.5 pl-2 text-left text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid'
  const content = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] border bg-surface font-mono text-[10px] leading-none font-semibold tracking-[0.04em] text-muted-foreground">
        {file.type}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{file.name}</span>
        {file.sizeBytes !== null && <Spec>{formatFileSize(file.sizeBytes)}</Spec>}
      </span>
    </>
  )
  return file.url ? (
    <a href={file.url} download={file.name} className={className}>
      {content}
    </a>
  ) : (
    <button type="button" className={className}>
      {content}
    </button>
  )
}

function MailTool({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className="size-8">
      <Icon strokeWidth={1.6} />
    </Button>
  )
}
