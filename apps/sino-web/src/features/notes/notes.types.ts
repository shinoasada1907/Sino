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

/** A note of text, or a diagram of blocks linked by arrows (fe-ui-diagram-notes, D-206). */
export type NoteKind = 'TEXT' | 'DIAGRAM'

export interface NoteItem {
  id: string
  kind: NoteKind
  /** At most 200 characters; null: the first line of `body` (a diagram: its main block) names the note (D-202). */
  title: string | null
  /** A text note: 1 to 20 000 characters; a diagram: empty. */
  body: string
  /** A diagram's blocks and links; null for a text note (D-211). */
  diagram: Diagram | null
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

export type Side = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT'
export type BlockColor = 'DEFAULT' | 'YELLOW' | 'GREEN' | 'RED' | 'BLUE'

/** The blocks and links of a diagram, saved as one (D-211). */
export interface Diagram {
  blocks: DiagramBlock[]
  links: DiagramLink[]
}

export interface DiagramBlock {
  /** Made by the web, so that a link can point at it before anything is saved. */
  id: string
  /** The top-left corner on the canvas, in px at 100 %. */
  x: number
  y: number
  /** 0 to 2 000 characters. */
  text: string
  color: BlockColor
  /** A main block: bold. */
  main: boolean
}

/** An arrow from one side of a block to one side of another. */
export interface DiagramLink {
  id: string
  from: string
  fromSide: Side
  to: string
  toSide: Side
  /** At most 80 characters. */
  label: string | null
}

export type NotesFilter = 'all' | 'linked' | 'pinned' | 'diagram'

/** What an edit changes; a title of only spaces is none. */
export interface NoteChange {
  title?: string
  body?: string
  pinned?: boolean
  diagram?: Diagram
}
