import type { Message, Quote } from './inbox.types'

/** How many characters of a message a quote keeps. */
const QUOTE_CHARS = 120

type ChatMessage = Message & { kind: 'MESSAGE' }

/** What a quote says of a message: its first words, or the kind of thing it is when it has no words ("Ảnh", "Sticker", the file's name). */
export function quoteText(message: ChatMessage): string {
  if (message.sticker || message.stickerSprite || message.libraryStickerId) {
    return 'Sticker'
  }
  if (message.image || message.attachments.some((file) => file.image)) {
    return 'Ảnh'
  }
  if (message.contactCard) {
    return 'Danh thiếp'
  }
  if (message.location) {
    return 'Vị trí'
  }
  const text = message.text.trim().replace(/\s+/g, ' ')
  if (message.attachments.length > 0 && (text === '' || text === message.attachments[0]?.name)) {
    return message.attachments[0]?.name ?? 'Tệp'
  }
  return text.length > QUOTE_CHARS ? `${text.slice(0, QUOTE_CHARS).trimEnd()}…` : text
}

/** The quote of a message, for the reply box and the bubble that is on its way. */
export const quoteOf = (message: ChatMessage): Quote => ({ messageId: message.id, senderName: message.sender, text: quoteText(message) })
