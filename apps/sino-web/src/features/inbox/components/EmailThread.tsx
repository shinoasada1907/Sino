import { AlarmClock, Archive, Calendar, CalendarPlus, Clock, ExternalLink, Search, SquareCheck, StickyNote, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { Spec } from '@/shared/ui/spec'
import { firstLine, formatFileSize, linkedMeta, mailTime, paragraphs, threadMeta, threadSubtitle } from '../format'
import type { ConversationDetail, ConversationItem, LinkedItem, LinkedKind, Message } from '../inbox.types'
import { Composer } from './Composer'
import { MailDot } from './icons'

type Mail = Message & { kind: 'MESSAGE' }

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks' },
  EVENT: { icon: Calendar, to: '/calendar' },
  NOTE: { icon: StickyNote, to: '/notes' },
}

/**
 * An email thread in the right column of the canvas `Inbox`: header and tools, linked items, the older emails folded
 * (a click opens one), the newest in full with its attachments, and the reply box. The tools have no flow yet (D-52).
 */
export function EmailThread({
  item,
  detail,
  account,
  now,
  nameOf,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: { externalAccountId: string }
  now: Date
  nameOf: ProviderNameOf
}) {
  const mails = (detail?.messages ?? []).filter((message): message is Mail => message.kind === 'MESSAGE')
  const newest = mails.at(-1)
  const [opened, setOpened] = useState<string[]>([])
  const toggle = (id: string) => setOpened((ids) => (ids.includes(id) ? ids.filter((open) => open !== id) : [...ids, id]))

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{item.subject ?? item.title}</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-[7px] border bg-raised text-foreground">
              <ProviderIcon provider={item.provider} className="size-3.5" />
            </span>
            <span className="text-sm text-muted-foreground">{threadSubtitle(item, account, nameOf)}</span>
            {detail && <Spec>{threadMeta(detail.messages)}</Spec>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tool label="Tìm trong cuộc trò chuyện" icon={Search} />
          <Tool label="Đánh dấu chưa đọc" icon={MailDot} />
          <Tool label="Lưu trữ" icon={Archive} />
          <Tool label="Tạm ẩn" icon={Clock} />
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <Button type="button" variant="secondary" size="sm">
            <ExternalLink strokeWidth={1.6} />
            Mở trong {nameOf(item.provider)}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-col gap-3 overflow-auto p-6">
        {detail?.linked && detail.linked.length > 0 && <LinkedChips items={detail.linked} now={now} />}
        {mails.map((mail) =>
          mail === newest ? (
            <MailCard key={mail.id} mail={mail} now={now} tools />
          ) : opened.includes(mail.id) ? (
            <MailCard key={mail.id} mail={mail} now={now} onFold={() => toggle(mail.id)} />
          ) : (
            <FoldedMail key={mail.id} mail={mail} now={now} onOpen={() => toggle(mail.id)} />
          ),
        )}
      </div>

      <Composer label={`Trả lời ${item.title}`} placeholder={`Trả lời ${item.title}…`} from={account.externalAccountId} />
    </>
  )
}

function Tool({ label, icon: Icon }: { label: string; icon: LucideIcon | typeof MailDot }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}>
      <Icon strokeWidth={1.6} />
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
      <Spec>{mailTime(mail.at, now, undefined, false)}</Spec>
    </button>
  )
}

// Canvas `.mail`: an open email; the newest carries the tools of the canvas, an older one folds back on its header.
function MailCard({ mail, now, tools = false, onFold }: { mail: Mail; now: Date; tools?: boolean; onFold?: () => void }) {
  const head = (
    <>
      <Avatar placeholder={placeholderOf(mail)} className="size-8" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold">{mail.sender}</span>
        {mail.to && <Spec className="truncate">tới {mail.to}</Spec>}
      </span>
    </>
  )
  const time = <Spec className="text-foreground">{mailTime(mail.at, now, undefined, true)}</Spec>

  return (
    <article className="flex flex-col gap-4 rounded-md border bg-surface p-5">
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
            <div role="toolbar" aria-label="Thao tác với thư này" className="mr-2.5 flex gap-0.5 rounded-[10px] border bg-raised p-0.75">
              <MailTool label="Tạo task" icon={SquareCheck} />
              <MailTool label="Nhắc tôi" icon={AlarmClock} />
              <MailTool label="Lịch hẹn" icon={CalendarPlus} />
              <MailTool label="Ghi chú" icon={StickyNote} />
            </div>
          )}
          {time}
        </div>
      )}
      <div className="flex max-w-155 flex-col gap-3 text-base">
        {paragraphs(mail.text).map((lines, index) => (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
      {mail.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {mail.attachments.map((file) => (
            <button
              key={file.name}
              type="button"
              className="inline-flex h-13 cursor-pointer items-center gap-2.5 rounded-sm border bg-raised pr-3.5 pl-2 text-left text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <span className="grid size-9 place-items-center rounded-[8px] border bg-surface font-mono text-[10px] leading-none font-semibold tracking-[0.04em] text-muted-foreground">
                {file.type}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">{file.name}</span>
                <Spec>{formatFileSize(file.sizeBytes)}</Spec>
              </span>
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function MailTool({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} className="size-8">
      <Icon strokeWidth={1.6} />
    </Button>
  )
}
