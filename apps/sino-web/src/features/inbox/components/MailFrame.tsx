import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FRAME_START, fitFrame, MAIL_FRAME_SANDBOX, mailDocument, type FrameFit } from '../mailFrame'

/**
 * Cleaned HTML of an email in an isolated frame (D-120): no script runs in it and nothing of it reaches the page of
 * Sino. The frame is as tall as the email, so the conversation scrolls as one; it follows the email when pictures load,
 * and measures again after each resize, which shows an email sized by the frame itself so that it stops (`fitFrame`).
 */
export function MailFrame({ html, showImages }: { html: string; showImages: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [fit, setFit] = useState<FrameFit>(FRAME_START)
  const [content, setContent] = useState<Document | null>(null)
  const document = useMemo(() => mailDocument(html, { showImages, origin: window.location.origin }), [html, showImages])

  const measure = useCallback(() => {
    const body = content?.body
    const view = content?.defaultView
    if (!body || !view) {
      return
    }
    // The body, not the page: the page is never shorter than the frame. A wide email adds its horizontal scrollbar.
    const wanted = body.scrollHeight + view.innerHeight - body.ownerDocument.documentElement.clientHeight
    setFit((current) => fitFrame(current, wanted, view.innerHeight))
  }, [content])

  useEffect(() => {
    const body = content?.body
    if (!body) {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [content, measure])

  // A resize of the frame changes nothing the observer sees in an email that fits, so measure once more after each.
  useEffect(() => {
    if (fit.done) {
      return
    }
    const id = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(id)
  }, [fit.height, fit.done, measure])

  useEffect(() => {
    const root = frame.current?.contentDocument?.documentElement
    if (fit.scroll && root) {
      root.style.overflowY = 'auto'
    }
  }, [fit.scroll, content])

  return (
    <div className="overflow-hidden rounded-sm border bg-white">
      <iframe
        ref={frame}
        title="Nội dung thư"
        sandbox={MAIL_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={document}
        onLoad={() => {
          // A new document ("Hiện ảnh"): follow it again from the height it has.
          setFit((current) => ({ ...FRAME_START, height: current.height }))
          setContent(frame.current?.contentDocument ?? null)
        }}
        className="block w-full"
        style={{ height: fit.height }}
      />
    </div>
  )
}
