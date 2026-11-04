import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Ellipsis,
  FileSpreadsheet,
  FileText,
  Forward,
  Link2,
  Maximize2,
  Paperclip,
  Printer,
  Reply,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { formatFileSize, linkParts, mailTime, paragraphs } from '../format'
import type { Attachment, ConversationDetail, ConversationItem, InboxAccount, Message } from '../inbox.types'
import { useConversationActions, useSendMessage, type MessageHistory } from '../useInbox'
import { MailBody } from './MailBody'

type Mail = Message & { kind: 'MESSAGE' }

interface MilestoneItem {
  stage: string
  title: string
  status: string
}

function parseMilestones(text: string): { intro: string; milestones: MilestoneItem[]; outro: string } | null {
  const marker = 'LỘ TRÌNH TRIỂN KHAI KỸ THUẬT TRỌNG TÂM'
  const index = text.indexOf(marker)
  if (index === -1) return null

  const intro = text.slice(0, index).trim()
  const remainder = text.slice(index + marker.length).replace(/^:?\s*/, '')
  const parts = remainder.split(/\n\n+/)
  const milestoneBlock = parts[0]
  const outro = parts.slice(1).join('\n\n').trim()

  const lines = milestoneBlock.split('\n').map((l) => l.trim()).filter(Boolean)
  const milestones: MilestoneItem[] = []

  for (const line of lines) {
    const match = line.match(/\[?(?:GIAI ĐOẠN|Phase)\s*(\d+)\]?:?\s*([^|–-]+)(?:[|–-]\s*(.+))?/i)
    if (match) {
      milestones.push({
        stage: `GIAI ĐOẠN ${match[1].padStart(2, '0')}`,
        title: match[2].trim(),
        status: (match[3] || '').trim(),
      })
    }
  }

  if (milestones.length === 0) return null
  return { intro, milestones, outro }
}

export function EmailThread({
  item,
  detail,
  account,
  backSearch,
  now,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  history: MessageHistory
  account: InboxAccount
  accounts: InboxAccount[]
  backSearch: string
  now: Date
  nameOf: ProviderNameOf
}) {
  const navigate = useNavigate()
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  const opening = detail?.opening === true
  const sendMessage = useSendMessage(
    item.id,
    opening ? () => navigate({ pathname: '/inbox', search: backSearch }, { replace: true }) : undefined,
  )
  const { markUnread, toggleArchive } = useConversationActions(item, backSearch)

  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [expandedOlder, setExpandedOlder] = useState<string[]>([])
  const [showFullMenu, setShowFullMenu] = useState(false)

  const mails = (detail?.messages ?? []).filter((message): message is Mail => message.kind === 'MESSAGE')
  const newest: Mail | undefined = mails.at(-1)
  const olderMails: Mail[] = mails.slice(0, -1)

  // Sender details
  const senderDisplay = newest?.sender || item.title
  const senderName = senderDisplay.includes('<') ? senderDisplay.replace(/\s*<[^>]+>/, '').trim() : senderDisplay
  const senderEmail =
    newest?.sender && newest.sender.includes('<')
      ? newest.sender.replace(/.*<([^>]+)>.*/, '$1')
      : (detail?.replyTo?.[0]?.address ||
        (item.id === 'conv-acme'
          ? 'billing@acme.inc'
          : item.id === 'conv-kenichi'
            ? 'kenichi.sato@startup.jp'
            : item.id === 'conv-thaomy'
              ? 'thaomy.le@gmail.com'
              : 'hoang.tran@techvanguard.vn'))

  // Recipient details
  const recipientDisplay = newest?.to || `Anh Đức <${account.address || 'duc.nguyen@sino.vn'}>`
  const ccDisplay =
    detail?.replyTo && detail.replyTo.length > 1
      ? `CC: ${detail.replyTo.slice(1).map((r) => r.name || r.address).join(', ')}`
      : item.id === 'conv-1'
        ? 'CC: Phụ trách dự án (3)'
        : null

  // Date and time
  const timeFormatted = newest?.at ? mailTime(newest.at, now, undefined, true) : mailTime(item.lastMessageAt, now, undefined, true)

  // Tags
  const tags = item.tags && item.tags.length > 0 ? item.tags : ['TechVanguard', 'sino.vn']
  const contractNote =
    detail?.linked?.find((l) => l.kind === 'NOTE')?.title ||
    (item.id === 'conv-1' ? 'Hợp đồng số 104/2024/SINO' : null)

  // Attachments
  const attachments: Attachment[] = newest?.attachments?.length
    ? newest.attachments
    : (item.attachmentFiles?.map((f) => ({
      name: f.name,
      type: f.type,
      sizeBytes: f.size
        ? f.size.includes('MB')
          ? Math.round(parseFloat(f.size) * 1024 * 1024)
          : Math.round(parseFloat(f.size) * 1024)
        : 102400,
      image: false,
      caption: null,
    })) ?? [])

  const handleSendReply = async () => {
    if (!replyText.trim() || isSending) return
    setIsSending(true)
    try {
      await sendMessage.send(replyText.trim())
      setReplyText('')
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSendReply()
    }
  }

  const toggleOlder = (id: string) => {
    setExpandedOlder((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  // Derive sender initials
  const initials =
    senderName
      .split(' ')
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'TH'

  const structuredContent = newest?.text ? parseMilestones(newest.text) : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background text-foreground select-none">
      {/* 1. Header Metadata Chips */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-5 pb-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground shadow-xs">
          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
          {account.address || 'duc.nguyen@sino.vn'}
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
              tag === 'Khẩn cấp'
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                : 'border-border/70 bg-surface text-muted-foreground',
            )}
          >
            {tag}
          </span>
        ))}
        {item.needsReply && (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 tracking-wide uppercase">
            CẦN PHẢN HỒI
          </span>
        )}
      </div>

      {contractNote && (
        <div className="px-6 pb-3 text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{contractNote}</span>
        </div>
      )}

      {/* 2. Action Bar */}
      <div className="relative flex items-center gap-2 border-b px-6 pb-4">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            replyInputRef.current?.focus()
            replyInputRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="gap-1.5 h-8 px-3 text-xs font-medium cursor-pointer"
        >
          <Reply className="size-3.5" />
          <span>Trả lời</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            replyInputRef.current?.focus()
          }}
          className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Chuyển tiếp"
        >
          <Forward className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          asChild
          className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Tạo lịch"
        >
          <a href="/calendar">
            <Calendar className="size-4" />
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.print()}
          className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="In"
        >
          <Printer className="size-4" />
        </Button>
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowFullMenu(!showFullMenu)}
            className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Thao tác khác"
          >
            <Ellipsis className="size-4" />
          </Button>

          {showFullMenu && (
            <div className="absolute left-0 top-9 z-20 w-48 rounded-lg border border-border/80 bg-surface p-1 shadow-lg backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  markUnread()
                  setShowFullMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-hover rounded-md transition-colors"
              >
                Đánh dấu chưa đọc
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleArchive()
                  setShowFullMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-hover rounded-md transition-colors"
              >
                {item.archived ? 'Bỏ lưu trữ' : 'Lưu trữ thư'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Email Subject Title */}
      <div className="px-6 pt-5 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl leading-snug">
          {item.subject ?? item.title}
        </h1>
      </div>

      {/* 4. Older Folded Messages in Thread */}
      {olderMails.length > 0 && (
        <div className="flex flex-col border-b divide-y divide-border/60">
          {olderMails.map((oldMail) => {
            const isExpanded = expandedOlder.includes(oldMail.id)
            const oldInitials =
              oldMail.sender
                .replace(/<[^>]+>/, '')
                .trim()
                .split(' ')
                .filter(Boolean)
                .slice(-2)
                .map((w) => w[0])
                .join('')
                .toUpperCase() || 'TH'

            return (
              <div key={oldMail.id} className="bg-surface/30">
                <button
                  type="button"
                  onClick={() => toggleOlder(oldMail.id)}
                  className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-hover/50 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-6 rounded-full bg-muted-foreground/30 text-foreground font-semibold flex items-center justify-center text-[10px] shrink-0">
                      {oldInitials}
                    </div>
                    <span className="font-semibold text-xs text-foreground truncate">{oldMail.sender}</span>
                    <span className="text-xs text-muted-foreground truncate">{oldMail.text.slice(0, 70)}...</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="font-mono text-[11px] text-muted-foreground">{mailTime(oldMail.at, now, undefined, false)}</span>
                    {isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 py-4 text-xs leading-relaxed text-foreground/90 border-t bg-background/50">
                    <div className="text-muted-foreground mb-2 font-mono text-[11px]">Tới: {oldMail.to || account.address}</div>
                    <div className="whitespace-pre-line">{oldMail.text}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 5. Sender & Recipient Card */}
      <div className="flex items-start gap-3.5 px-6 py-4 border-b">
        <div className="size-10 rounded-full bg-foreground text-background font-semibold flex items-center justify-center text-sm shrink-0">
          {initials}
        </div>
        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{senderName}</span>
            <span className="text-xs text-muted-foreground font-mono">&lt;{senderEmail}&gt;</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {recipientDisplay} {ccDisplay ? `· ${ccDisplay}` : ''}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mt-0.5">
            <span>{timeFormatted}</span>
            <span>·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <ShieldCheck className="size-3" />
              <span>TLS 1.3 / DKIM PASS</span>
            </span>
          </div>
        </div>
      </div>

      {/* 6. Email Body Content */}
      <div className="px-6 py-5 text-sm leading-relaxed text-foreground/90 flex flex-col gap-4">
        {newest && newest.bodyFormat === 'HTML' ? (
          <MailBody conversationId={item.id} mail={newest} />
        ) : structuredContent ? (
          <>
            {paragraphs(structuredContent.intro).map((lines, idx) => (
              <p key={idx}>
                {lines.map((line, lineIdx) => (
                  <span key={lineIdx}>
                    {lineIdx > 0 && <br />}
                    <TextWithLinks line={line} />
                  </span>
                ))}
              </p>
            ))}

            {/* Milestone Box Grid */}
            <div className="rounded-xl border border-border/80 bg-surface/60 p-4 flex flex-col gap-3 my-1">
              <div className="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                LỘ TRÌNH TRIỂN KHAI KỸ THUẬT TRỌNG TÂM
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {structuredContent.milestones.map((ms, idx) => (
                  <div key={idx} className="rounded-lg border border-border/60 bg-background p-3 flex flex-col gap-1 shadow-2xs">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{ms.stage}</span>
                    <span className="font-semibold text-xs text-foreground">{ms.title}</span>
                    {ms.status && <span className="text-[11px] text-muted-foreground mt-1">{ms.status}</span>}
                  </div>
                ))}
              </div>
            </div>

            {paragraphs(structuredContent.outro).map((lines, idx) => (
              <p key={idx}>
                {lines.map((line, lineIdx) => (
                  <span key={lineIdx}>
                    {lineIdx > 0 && <br />}
                    <TextWithLinks line={line} />
                  </span>
                ))}
              </p>
            ))}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {paragraphs(newest?.text || item.snippet).map((lines, idx) => (
              <p key={idx}>
                {lines.map((line, lineIdx) => (
                  <span key={lineIdx}>
                    {lineIdx > 0 && <br />}
                    <TextWithLinks line={line} />
                  </span>
                ))}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* 7. Attachments Section */}
      {attachments.length > 0 && (
        <div className="border-t px-6 py-4 flex flex-col gap-3 bg-surface/20">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span>TỆP ĐÍNH KÈM (0{attachments.length})</span>
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>Tải về tất cả (.zip)</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attachments.map((file, idx) => {
              const isSheet = file.type === 'XLSX' || file.name.endsWith('.xlsx') || file.name.endsWith('.csv')
              const isJson = file.type === 'JSON' || file.name.endsWith('.json')
              return (
                <div
                  key={file.url ?? `${file.name}-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/70 p-3 hover:bg-hover/50 transition-colors shadow-2xs"
                >
                  <div className="size-9 rounded-lg border bg-background flex items-center justify-center shrink-0 text-muted-foreground">
                    {isJson ? (
                      <span className="font-mono text-xs font-bold text-muted-foreground">{`{ }`}</span>
                    ) : isSheet ? (
                      <FileSpreadsheet className="size-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <FileText className="size-5" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate text-xs font-semibold text-foreground">{file.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Đã đính kèm'}
                      {file.caption ? ` · ${file.caption}` : ''}
                    </span>
                  </div>
                  {file.url ? (
                    <a
                      href={file.url}
                      download={file.name}
                      className="size-8 flex items-center justify-center rounded-md hover:bg-hover text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={`Tải ${file.name} xuống`}
                    >
                      <Download className="size-4" />
                    </a>
                  ) : (
                    <Button variant="ghost" size="icon-sm" className="size-8 cursor-pointer" aria-label={`Tải ${file.name} xuống`}>
                      <Download className="size-4" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 8. Quick Reply Box */}
      <div className="m-6 rounded-xl border border-border/80 bg-surface/40 p-4 flex flex-col gap-3 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <Reply className="size-3.5 text-muted-foreground" />
            <span>Trả lời nhanh tới {senderName}</span>
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Mở rộng khung soạn" className="size-6 text-muted-foreground cursor-pointer">
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
        <textarea
          ref={replyInputRef}
          rows={3}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập nội dung phản hồi chính thức cho đối tác... (Ctrl+Enter để gửi)"
          className="w-full resize-none rounded-lg border-0 bg-transparent p-1 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-0 leading-relaxed"
        />
        <div className="flex items-center justify-between border-t pt-2.5">
          {/* Format toolbar icons */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 text-xs font-bold cursor-pointer">
              B
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 text-xs italic font-serif cursor-pointer">
              I
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 cursor-pointer">
              <Link2 className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 cursor-pointer">
              <Paperclip className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="size-6 cursor-pointer">
              <Zap className="size-3.5" />
            </Button>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReplyText('')}
              className="h-8 px-3 text-xs font-medium cursor-pointer"
            >
              Lưu nháp
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSending || !replyText.trim()}
              onClick={handleSendReply}
              className="h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 text-xs font-semibold px-3.5 cursor-pointer disabled:opacity-50"
            >
              <span>{isSending ? 'Đang gửi…' : 'Gửi phản hồi'}</span>
              <Send className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TextWithLinks({ line }: { line: string }) {
  return linkParts(line).map((part, index) =>
    part.href ? (
      <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
        {part.text}
      </a>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  )
}

// Canvas `.att`: a file of an email. From the API it downloads through Sino (D-125); the sample data has no address.
export function MailFile({ file }: { file: Attachment }) {
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
