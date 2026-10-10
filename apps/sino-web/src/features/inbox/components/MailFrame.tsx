import { useEffect, useRef, useState } from 'react'
import { MAIL_FRAME_SANDBOX, mailDocument } from '../mailFrame'

/**
 * Cleaned HTML of an email in an isolated frame (D-120): no script runs in it and nothing of it reaches the page of
 * Sino. The frame is as tall as the email, so the conversation scrolls as one; it follows the email when pictures load.
 */
export function MailFrame({ html, showImages }: { html: string; showImages: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number>()
  const [content, setContent] = useState<Document | null>(null)

  useEffect(() => {
    const body = content?.body
    const view = content?.defaultView
    if (!body || !view) {
      return
    }
    // The body, not the page: the page is never shorter than the frame. A wide email adds its horizontal scrollbar.
    const measure = () => setHeight(body.scrollHeight + view.innerHeight - body.ownerDocument.documentElement.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [content])

  return (
    <div className="overflow-hidden rounded-sm border bg-white">
      <iframe
        ref={frame}
        title="Nội dung thư"
        sandbox={MAIL_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={mailDocument(html, { showImages, origin: window.location.origin })}
        onLoad={() => setContent(frame.current?.contentDocument ?? null)}
        className="block w-full"
        style={{ height: height ?? 160 }}
      />
    </div>
  )
}
