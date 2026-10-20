// Turns the notes data (instants, anchors, lengths) into the Vietnamese text of the Ghi chú screens.
import { calendarDaysBetween, formatClock, formatDayMonth, localParts, weekdayShort } from '@/shared/time/local'
import type { LocalDate } from '@/shared/domain'
import { diagramSummary } from './diagram/diagram'
import type { Diagram, NoteAnchor, NoteItem, NotesFilter } from './notes.types'

/** At most this many characters in the text of a note (spec `notes`). */
export const NOTE_MAX_LENGTH = 20_000

/**
 * The name of a note: its title, else the first line of its text (D-202); a diagram's, else its first block with words,
 * the main ones first, else "Sơ đồ mới" (fe-ui-diagram-notes, D-206).
 */
export function noteTitle(note: Pick<NoteItem, 'title' | 'body'> & Partial<Pick<NoteItem, 'kind' | 'diagram'>>): string {
  const title = note.title?.trim()
  if (title) {
    return title
  }
  if (note.kind === 'DIAGRAM') {
    const first = blockTexts(note.diagram)[0]
    return first ? firstLine(first) : 'Sơ đồ mới'
  }
  return firstLine(note.body)
}

/** The start of a note on its card: its text, or the words of a diagram's first three blocks on one line, the main ones first. */
export function notePreview(note: Pick<NoteItem, 'body'> & Partial<Pick<NoteItem, 'kind' | 'diagram'>>): string {
  if (note.kind !== 'DIAGRAM') {
    return note.body
  }
  return blockTexts(note.diagram)
    .slice(0, 3)
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .join(' · ')
}

/** When a note was edited, on its card: "09:52" today, "Hôm qua", "29/09", "29/12/2025" another year (D-205). */
export function noteTime(at: string, now: Date, timeZone?: string): string {
  const date = new Date(at)
  const days = calendarDaysBetween(date, now, timeZone)
  if (days === 0) {
    return formatClock(date, timeZone)
  }
  if (days === 1) {
    return 'Hôm qua'
  }
  return localParts(date, timeZone).year === localParts(now, timeZone).year
    ? formatDayMonth(date, timeZone)
    : `${formatDayMonth(date, timeZone)}/${localParts(date, timeZone).year}`
}

/** Where a note comes from, at the foot of its card (D-204); a diagram says how big it is (D-206). */
export function noteSource(
  note: Pick<NoteItem, 'anchor'> & Partial<Pick<NoteItem, 'kind' | 'diagram'>>,
): { tone: 'anchor' | 'missing' | 'standalone' | 'diagram'; text: string } {
  const { anchor } = note
  if (note.kind === 'DIAGRAM' && !anchor) {
    return { tone: 'diagram', text: `Sơ đồ · ${diagramSummary(note.diagram ?? { blocks: [], links: [] })}` }
  }
  if (!anchor) {
    return { tone: 'standalone', text: 'Ghi chú độc lập' }
  }
  if (anchor.missing) {
    return { tone: 'missing', text: 'Tin nhắn gốc không còn' }
  }
  const kind = { MESSAGE: anchor.conversationKind === 'CHAT' ? 'Tin nhắn' : 'Thư', CONVERSATION: 'Cuộc trò chuyện', PARTICIPANT: 'Người' }[anchor.kind]
  return { tone: 'anchor', text: `${kind} · ${anchor.label}` }
}

/** "ĐÃ GHIM" and "GẦN ĐÂY", each the newest edit first (D-205). */
export function groupNotes(notes: NoteItem[]): { pinned: NoteItem[]; recent: NoteItem[] } {
  const sorted = [...notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return { pinned: sorted.filter((note) => note.pinned), recent: sorted.filter((note) => !note.pinned) }
}

/**
 * The notes of a filter whose title or text holds the query, whatever its case and accents (D-205); a diagram is found
 * by the words of its blocks and links too (D-206).
 */
export function filterNotes(notes: NoteItem[], filter: NotesFilter, query: string): NoteItem[] {
  const wanted = plain(query.trim())
  return notes.filter((note) => inFilter(note, filter) && (wanted === '' || plain(searchText(note)).includes(wanted)))
}

/** How many notes each chip holds, over every note (D-205). */
export function noteCounts(notes: NoteItem[]): Record<NotesFilter, number> {
  return {
    all: notes.length,
    linked: notes.filter((note) => inFilter(note, 'linked')).length,
    pinned: notes.filter((note) => inFilter(note, 'pinned')).length,
    diagram: notes.filter((note) => inFilter(note, 'diagram')).length,
  }
}

function inFilter(note: NoteItem, filter: NotesFilter): boolean {
  return { all: true, linked: note.anchor !== null, pinned: note.pinned, diagram: note.kind === 'DIAGRAM' }[filter]
}

function searchText(note: NoteItem): string {
  const diagram = note.diagram ? [...note.diagram.blocks.map((block) => block.text), ...note.diagram.links.map((link) => link.label ?? '')] : []
  return [note.title ?? '', note.body, ...diagram].join('\n')
}

// The words of the blocks, the main blocks first, then the others in their order; a block without words is left out.
function blockTexts(diagram: Diagram | null | undefined): string[] {
  const blocks = diagram?.blocks ?? []
  return [...blocks.filter((block) => block.main), ...blocks.filter((block) => !block.main)].map((block) => block.text).filter((text) => text.trim() !== '')
}

function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim() !== '')?.trim() ?? ''
}

/** "Gắn với thư", above the chip of the editor (D-204). */
export function anchorHeading(anchor: NoteAnchor): string {
  const kind = { MESSAGE: anchor.conversationKind === 'CHAT' ? 'tin nhắn' : 'thư', CONVERSATION: 'cuộc trò chuyện', PARTICIPANT: 'người' }[anchor.kind]
  return `Gắn với ${kind}`
}

/** "Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2" */
export function anchorChip(anchor: NoteAnchor): string {
  return anchor.subject ? `${anchor.label} · ${anchor.subject}` : anchor.label
}

/** "TRÍCH TỪ THƯ · 09:41 HÔM NAY" */
export function quoteHeading(anchor: NoteAnchor | null, at: string, now: Date, timeZone?: string): string {
  const from = anchor ? (anchor.conversationKind === 'CHAT' ? 'TRÍCH TỪ TIN NHẮN' : 'TRÍCH TỪ THƯ') : 'TRÍCH'
  return `${from} · ${when(at, now, timeZone).toUpperCase()}`
}

/** "Sửa lúc 09:52 hôm nay · tự lưu", at the foot of the editor (D-203). */
export function editedLine(at: string, now: Date, timeZone?: string): string {
  return `Sửa lúc ${when(at, now, timeZone)} · tự lưu`
}

/** "TỰ LƯU · 09:52", under the title of the phone editor (canvas `MobileNoteEditor`). */
export function savedLine(at: string, now: Date, timeZone?: string): string {
  const date = new Date(at)
  const today = calendarDaysBetween(date, now, timeZone) === 0
  return `TỰ LƯU · ${today ? formatClock(date, timeZone) : formatDayMonth(date, timeZone)}`
}

/** "214 / 20.000 ký tự" */
export function lengthLine(body: string): string {
  return `${body.length.toLocaleString('vi-VN')} / ${NOTE_MAX_LENGTH.toLocaleString('vi-VN')} ký tự`
}

/** "hạn T4 07/10" for a related task; null without a due. */
export function linkedDue({ dueAt, dueDate }: { dueAt: string | null; dueDate: LocalDate | null }, timeZone?: string): string | null {
  // A whole day is that calendar day wherever the reader is; noon keeps it inside the day in any zone.
  const date = dueAt ? new Date(dueAt) : dueDate ? new Date(`${dueDate}T12:00:00Z`) : null
  if (!date) {
    return null
  }
  const zone = dueAt ? timeZone : 'UTC'
  return `hạn ${weekdayShort(date, zone)} ${formatDayMonth(date, zone)}`
}

// "09:41 hôm nay", "21:02 hôm qua", "28/09 · 16:20"
function when(at: string, now: Date, timeZone?: string): string {
  const date = new Date(at)
  const days = calendarDaysBetween(date, now, timeZone)
  const clock = formatClock(date, timeZone)
  return days === 0 ? `${clock} hôm nay` : days === 1 ? `${clock} hôm qua` : `${formatDayMonth(date, timeZone)} · ${clock}`
}

// Lower case without accents, "đ" as "d": what a search compares.
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
}

/**
 * Whether any note is tied to something. Until one is, every note is standalone, and "Gắn tin nhắn" and the source line
 * "Ghi chú độc lập" would only be noise on each of them (F15, D-178).
 */
export function hasAnchoredNotes(notes: NoteItem[]): boolean {
  return notes.some((note) => note.anchor !== null)
}
