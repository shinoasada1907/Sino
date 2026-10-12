import type { Instant, LocalDate, ProviderType } from '@/shared/domain'

/**
 * Data contract of the Ghi chú screen (D-42), handed to the backend for F15; see the change design.md
 * (`openspec/changes/fe-ui-notes`).
 */

/** `GET /api/notes`: every note of the owner. */
export interface NotesData {
  generatedAt: Instant
  notes: NoteItem[]
}

export interface NoteItem {
  id: string
  /** At most 200 characters; null: the first line of `body` names the note (D-202). */
  title: string | null
  /** 1 to 20 000 characters. */
  body: string
  pinned: boolean
  createdAt: Instant
  updatedAt: Instant
  /** What the note is tied to; null for a standalone note. */
  anchor: NoteAnchor | null
  /** A passage of the message it is tied to, read only. */
  quote: { text: string; at: Instant } | null
  /** Tasks made from the same message. */
  linked: LinkedTask[]
}

export interface NoteAnchor {
  kind: 'MESSAGE' | 'CONVERSATION' | 'PARTICIPANT'
  provider: ProviderType | null
  /** "Thư" or "Tin nhắn"; null for a person. */
  conversationKind: 'EMAIL' | 'CHAT' | null
  /** The person or the conversation. */
  label: string
  /** The subject of an email, for the chip of the editor. */
  subject: string | null
  /** Opens the conversation in Hộp thư; null for a person. */
  conversationId: string | null
  /** The message or conversation is no longer in Sino. */
  missing: boolean
}

export interface LinkedTask {
  kind: 'TASK'
  id: string
  title: string
  dueAt: Instant | null
  dueDate: LocalDate | null
}

export type NotesFilter = 'all' | 'linked' | 'pinned'

/** What an edit changes; a title of only spaces is none. */
export interface NoteChange {
  title?: string
  body?: string
  pinned?: boolean
}
