import { CalendarClock, ChevronDown, Paperclip, Send } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useOnline } from '@/shared/lib/useOnline'
import { Button } from '@/shared/ui/button'
import { Kbd } from '@/shared/ui/kbd'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AttachmentTray } from '../useAttachmentTray'
import { AttachmentTrayView } from './AttachmentTray'
import { StickerPicker } from './StickerPicker'

/**
 * The reply box of the canvas (`.composer`): an email has the sending account and "Gửi lúc…" and sends with Ctrl Enter
 * (Enter starts a line), a chat names the account it goes through and sends with Enter (Shift Enter starts a line).
 * Nothing empty is sent. Attaching, choosing the account and "Gửi lúc…" have no flow yet (D-52). Below 768px it is the
 * canvas `.mob-composer`: one row of attach, a round box and the send buttons; the box and the bar below it then use
 * `display: contents`, so the same text box and buttons are laid out again instead of being drawn twice. From 768 to
 * 1279px the bar drops the account and the shortcut, as the tablet reply box of the canvas. Offline, the bar says the
 * message waits for the network and the button queues it (`InboxState` offline, D-55). When the server says who the
 * reply goes to, a "Tới" line names them above the box at every width (no canvas; D-134: a wrong recipient is worse).
 * A chat that can send pictures has a "Sticker" button after the attach button (zalo-send-images ZS-08, D-356).
 */
export function Composer({
  kind,
  label,
  placeholder,
  account,
  via,
  from,
  to,
  onSend,
  onSendSticker,
  tray,
  onSendFiles,
}: {
  kind: 'EMAIL' | 'CHAT'
  label: string
  placeholder: string
  account: string
  /** "Zalo · +84 9•• ••• 218" for a chat. */
  via: string
  /**
   * The sending account of a thread in several accounts, on a line of its own below 1280px, where the bar has no room
   * for it (f05b, D-186); the bar says it from 1280px.
   */
  from?: string
  /** "Trần Minh Anh <minhanh@acme.vn>": who the reply goes to. */
  to?: string
  onSend: (text: string) => void
  /** Given only where a sticker can be sent (a chat whose account sends pictures): then the "Sticker" button shows. */
  onSendSticker?: (stickerId: string) => void
  /**
   * Given only where pictures and files can be sent (zalo-send-files, D-376), with `onSendFiles`: pasting a file, the
   * paperclip and a drop on the chat put files in this tray, and sending sends them before the text.
   */
  tray?: AttachmentTray
  onSendFiles?: (files: File[], text: string) => void
}) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const email = kind === 'EMAIL'
  const [text, setText] = useState('')
  const files = tray && onSendFiles ? tray.items : []
  const empty = text.trim() === '' && files.length === 0
  // Files that came with the paperclip or a drop leave the focus elsewhere: the text box takes it, so Enter sends them.
  const counted = useRef(files.length)
  useEffect(() => {
    if (files.length > counted.current) {
      box.current?.focus()
    }
    counted.current = files.length
  }, [files.length])
  const online = useOnline()
  const sendLabel = online ? 'Gửi' : 'Xếp hàng gửi'

  const send = () => {
    if (files.length > 0 && onSendFiles) {
      onSendFiles(
        files.map((item) => item.file),
        text.trim(),
      )
      tray?.clear()
      setText('')
    } else if (!empty) {
      onSend(text.trim())
      setText('')
    }
  }
  // Only a paste that carries files goes to the tray; pasting text stays as it is.
  const takePastedFiles = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData?.files ?? [])
    if (tray && onSendFiles && pasted.length > 0) {
      event.preventDefault()
      tray.add(pasted)
    }
  }
  const sendOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An input method (Telex, VNI…) uses Enter to finish a word; that Enter must not send.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }
    if (email ? event.ctrlKey || event.metaKey : !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }
  return (
    <div className="relative flex flex-wrap items-end gap-2 border-t bg-background px-3 pt-2.5 pb-6 md:flex-col md:flex-nowrap md:items-stretch md:px-5 md:pt-3 md:pb-4 xl:px-6 xl:pt-4 xl:pb-5">
      {from && (
        <p className="order-first w-full text-sm [overflow-wrap:anywhere] text-muted-foreground md:order-none xl:hidden">
          Gửi từ <span className="text-foreground">{from}</span>
        </p>
      )}
      {to && (
        // First in the row of the phone, where the attach button is also first, and alone on its line; it wraps rather
        // than cut a recipient off.
        <p className="order-first w-full text-sm [overflow-wrap:anywhere] text-muted-foreground md:order-none">
          Tới <span className="text-foreground">{to}</span>
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface py-2.5 pr-3 pl-3.5 transition-[border-color,box-shadow] duration-(--dur-hover) ease-out focus-within:border-foreground focus-within:ring-3 focus-within:ring-foreground/14 max-md:contents">
        {tray && onSendFiles && <AttachmentTrayView tray={tray} />}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          ref={box}
          id={id}
          rows={email ? 2 : 1}
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendOnShortcut}
          onPaste={takePastedFiles}
          className="min-h-11 min-w-0 grow resize-none rounded-[22px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-subtle-foreground max-md:transition-[border-color,box-shadow] max-md:duration-(--dur-hover) max-md:ease-out max-md:focus:border-foreground max-md:focus:ring-3 max-md:focus:ring-foreground/14 md:grow-0 md:rounded-none md:border-none md:bg-transparent md:p-0"
        />
        <div className="flex items-center gap-2 max-md:contents">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={email ? 'Đính kèm tệp' : 'Đính kèm tệp hoặc ảnh'}
            className="max-md:order-first max-md:size-11"
            onClick={tray && onSendFiles ? () => picker.current?.click() : undefined}
          >
            <Paperclip strokeWidth={1.6} />
          </Button>
          {tray && onSendFiles && (
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              onChange={(event) => {
                tray.add(Array.from(event.target.files ?? []))
                // The same file can be chosen again after it was taken out.
                event.target.value = ''
              }}
            />
          )}
          {!email && onSendSticker && <StickerPicker onPick={onSendSticker} focusAfterPick={box} className="max-md:order-first max-md:size-11" />}
          {!online ? (
            <Status tone="err" className="min-w-0 max-md:hidden">
              Sẽ gửi khi có mạng
            </Status>
          ) : email ? (
            <button
              type="button"
              className="hidden h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[13px] leading-4.5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid xl:inline-flex"
            >
              Gửi từ {account}
              <ChevronDown className="size-3.5" strokeWidth={1.6} />
            </button>
          ) : (
            <Spec className="min-w-0 truncate max-md:hidden">Gửi qua {via}</Spec>
          )}
          <Kbd className="ml-auto max-xl:hidden">{email ? 'Ctrl Enter' : 'Enter'}</Kbd>
          {email ? (
            <div className="inline-flex max-xl:ml-auto">
              <Button type="button" variant="primary" size="sm" className="rounded-r-none max-md:h-11" disabled={empty} onClick={send}>
                <span className="max-md:sr-only">{sendLabel}</span>
                <Send strokeWidth={1.6} />
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                aria-label="Tùy chọn gửi: Gửi lúc…"
                className="w-8 rounded-l-none border-l border-l-[color-mix(in_srgb,var(--on-inverse)_28%,transparent)] px-0 max-md:h-11"
              >
                <ChevronDown strokeWidth={1.6} />
              </Button>
            </div>
          ) : (
            <>
              <Button type="button" variant="ghost" size="icon" aria-label="Gửi lúc…" className="md:hidden">
                <CalendarClock strokeWidth={1.6} />
              </Button>
              <Button type="button" variant="primary" size="sm" disabled={empty} onClick={send} className="max-xl:ml-auto max-md:size-11 max-md:px-0">
                <span className="max-md:sr-only">{sendLabel}</span>
                <Send strokeWidth={1.6} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
