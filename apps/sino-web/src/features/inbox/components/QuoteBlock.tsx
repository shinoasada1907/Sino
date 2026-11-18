import { cn } from '@/shared/lib/utils'
import type { Quote } from '../inbox.types'

/**
 * The message a chat bubble answers, above its text: the sender and the first words. When the original is in the list,
 * pressing it scrolls there (`onJump`); otherwise it is only text.
 */
export function QuoteBlock({ quote, own, onJump }: { quote: Quote; own: boolean; onJump?: (messageId: string) => void }) {
  const body = (
    <>
      <span className="block truncate text-[11px] leading-4 font-semibold">{quote.senderName}</span>
      <span className="line-clamp-2 text-[11px] leading-4 break-words opacity-80">{quote.text}</span>
    </>
  )
  const style = cn('mb-1.5 block w-full min-w-0 rounded-md border-l-2 px-2 py-1 text-left', own ? 'border-primary-foreground/60 bg-primary-foreground/12' : 'border-border-strong bg-hover')
  return onJump ? (
    <button
      type="button"
      data-slot="quote"
      aria-label={`Tin được trả lời của ${quote.senderName}: ${quote.text}`}
      onClick={() => onJump(quote.messageId)}
      className={cn(style, 'cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid')}
    >
      {body}
    </button>
  ) : (
    <div data-slot="quote" className={style}>
      {body}
    </div>
  )
}
