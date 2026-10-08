import { ChevronDown, Paperclip, Send } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Kbd } from '@/shared/ui/kbd'
import { Spec } from '@/shared/ui/spec'

/**
 * The reply box of the canvas (`.composer`): an email has the sending account and "Gửi lúc…" and sends with Ctrl Enter
 * (Enter starts a line), a chat names the account it goes through and sends with Enter (Shift Enter starts a line).
 * Nothing empty is sent. Attaching, choosing the account and "Gửi lúc…" have no flow yet (D-52).
 */
export function Composer({
  kind,
  label,
  placeholder,
  account,
  via,
  onSend,
}: {
  kind: 'EMAIL' | 'CHAT'
  label: string
  placeholder: string
  account: string
  /** "Zalo · +84 9•• ••• 218" for a chat. */
  via: string
  onSend: (text: string) => void
}) {
  const id = useId()
  const email = kind === 'EMAIL'
  const [text, setText] = useState('')
  const empty = text.trim() === ''

  const send = () => {
    if (!empty) {
      onSend(text.trim())
      setText('')
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
    <div className="flex flex-col gap-2 border-t bg-background px-6 pt-4 pb-5">
      <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface py-2.5 pr-3 pl-3.5 transition-[border-color,box-shadow] duration-(--dur-hover) ease-out focus-within:border-foreground focus-within:ring-3 focus-within:ring-foreground/14">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          id={id}
          rows={email ? 2 : 1}
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendOnShortcut}
          className="min-h-11 resize-none border-none bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={email ? 'Đính kèm tệp' : 'Đính kèm tệp hoặc ảnh'}>
            <Paperclip strokeWidth={1.6} />
          </Button>
          {email ? (
            <button
              type="button"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[13px] leading-[18px] font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Gửi từ {account}
              <ChevronDown className="size-3.5" strokeWidth={1.6} />
            </button>
          ) : (
            <Spec>Gửi qua {via}</Spec>
          )}
          <Kbd className="ml-auto">{email ? 'Ctrl Enter' : 'Enter'}</Kbd>
          {email ? (
            <div className="inline-flex">
              <Button type="button" variant="primary" size="sm" className="rounded-r-none" disabled={empty} onClick={send}>
                Gửi
                <Send strokeWidth={1.6} />
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                aria-label="Tùy chọn gửi: Gửi lúc…"
                className="w-8 rounded-l-none border-l border-l-[color-mix(in_srgb,var(--on-inverse)_28%,transparent)] px-0"
              >
                <ChevronDown strokeWidth={1.6} />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="primary" size="sm" disabled={empty} onClick={send}>
              Gửi
              <Send strokeWidth={1.6} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
