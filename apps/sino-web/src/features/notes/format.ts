// Turns the notes data (instants, anchors, lengths) into the Vietnamese text of the Ghi chú screens.
import { calendarDaysBetween, formatClock, formatDayMonth, localParts, weekdayShort } from '@/shared/time/local'
import type { LocalDate } from '@/shared/domain'
import type { NoteAnchor, NoteItem, NotesFilter } from './notes.types'

/** At most this many characters in the text of a note (spec `notes`). */
export const NOTE_MAX_LENGTH = 20_000

/** The name of a note: its title, else the first line of its text (D-202). */
export function noteTitle(note: Pick<NoteItem, 'title' | 'body'>): string {
  const title = note.title?.trim()
  return title || (note.body.split('\n').find((line) => line.trim() !== '')?.trim() ?? '')
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

/** Where a note comes from, at the foot of its card (D-204). */
export function noteSource(note: Pick<NoteItem, 'anchor'>): { tone: 'anchor' | 'missing' | 'standalone'; text: string } {
  const { anchor } = note
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

/** The notes of a filter whose title or text holds the query, whatever its case and accents (D-205). */
export function filterNotes(notes: NoteItem[], filter: NotesFilter, query: string): NoteItem[] {
  const wanted = plain(query.trim())
  return notes.filter(
    (note) =>
      (filter === 'all' || (filter === 'linked' ? note.anchor !== null : note.pinned)) &&
      (wanted === '' || plain(`${note.title ?? ''}\n${note.body}`).includes(wanted)),
  )
}

/** How many notes each chip holds, over every note (D-205). */
export function noteCounts(notes: NoteItem[]): Record<NotesFilter, number> {
  return { all: notes.length, linked: notes.filter((note) => note.anchor !== null).length, pinned: notes.filter((note) => note.pinned).length }
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
