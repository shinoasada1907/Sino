import { Fragment, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { linkParts, paragraphs } from '../format'
import type { Message } from '../inbox.types'
import { useMessageBody } from '../useInbox'
import { MailFrame } from './MailFrame'

type Mail = Message & { kind: 'MESSAGE' }

/**
 * The content of an open email (F06). An email that is only text shows its paragraphs, web addresses as links. Any
 * other asks for its cleaned HTML (D-123) and shows it in the isolated frame; meanwhile the text shows, dimmed, and it
 * stays, with a line to try again, when the HTML cannot load. An older email that turns out to have no HTML stays text.
 */
export function MailBody({ conversationId, mail }: { conversationId: string; mail: Mail }) {
  const asks = mail.bodyFormat === 'HTML' || mail.bodyFormat === 'UNCHECKED'
  const { body, failed, retry } = useMessageBody(conversationId, mail.id, asks)

  if (body?.html) {
    return <HtmlBody html={body.html} remoteImages={body.remoteImages} />
  }
  const waiting = asks && !body && !failed
  return (
    <div className="flex flex-col gap-3">
      {failed && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <span className="min-w-0 grow">Không tải được bản đầy đủ của thư này. Đang hiện phần chữ.</span>
          <Button type="button" variant="secondary" size="sm" onClick={retry}>
            Thử lại
          </Button>
        </div>
      )}
      <TextBody text={mail.text} waiting={waiting} />
    </div>
  )
}

// The pictures of the web wait for the reader, for this email and this time only (D-121).
function HtmlBody({ html, remoteImages }: { html: string; remoteImages: boolean }) {
  const [showImages, setShowImages] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {remoteImages && !showImages && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border bg-raised px-3.5 py-2.5 text-sm text-muted-foreground">
          <span className="min-w-0 grow">Ảnh trong thư đang ẩn để người gửi không biết bạn đã mở thư.</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowImages(true)}>
            Hiện ảnh
          </Button>
        </div>
      )}
      <MailFrame html={html} showImages={showImages} />
    </div>
  )
}

function TextBody({ text, waiting }: { text: string; waiting: boolean }) {
  return (
    <div aria-busy={waiting} className={waiting ? 'flex max-w-155 flex-col gap-3 text-base opacity-60' : 'flex max-w-155 flex-col gap-3 text-base'}>
      {text.trim() === '' ? (
        <p className="text-sm text-muted-foreground">Thư không có chữ.</p>
      ) : (
        paragraphs(text).map((lines, index) => (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                <TextWithLinks line={line} />
              </span>
            ))}
          </p>
        ))
      )}
    </div>
  )
}

// A line of an email; its web addresses open in a new tab, without telling the site where the reader came from.
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
