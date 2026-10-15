import { describe, expect, it } from 'vitest'
import {
  anchorChip,
  anchorHeading,
  editedLine,
  filterNotes,
  groupNotes,
  lengthLine,
  linkedDue,
  noteCounts,
  notePreview,
  noteSource,
  noteTime,
  noteTitle,
  quoteHeading,
  savedLine,
} from './format'
import { createNotesSample } from './notes.sample'
import type { NoteAnchor, NoteItem } from './notes.types'

const TZ = 'Asia/Ho_Chi_Minh'
// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const now = new Date('2026-10-02T07:05:00Z')
const vn = (time: string) => new Date(`${time}+07:00`).toISOString()
const titles = (notes: NoteItem[]) => notes.map(noteTitle)

function note(extra: Partial<NoteItem>): NoteItem {
  return {
    id: 'n',
    title: 'Ghi chú',
    body: 'Nội dung',
    pinned: false,
    createdAt: vn('2026-10-01T09:00'),
    updatedAt: vn('2026-10-01T09:00'),
    anchor: null,
    quote: null,
    linked: [],
    kind: 'TEXT',
    diagram: null,
    ...extra,
  }
}

// A diagram note of three blocks, the main one last in the list.
const diagramNote = (extra: Partial<NoteItem> = {}): NoteItem =>
  note({
    kind: 'DIAGRAM',
    title: null,
    body: '',
    diagram: {
      blocks: [
        { id: 'b1', x: 0, y: 0, text: 'Thuê homestay\ngần hồ', color: 'DEFAULT', main: false },
        { id: 'b2', x: 0, y: 0, text: 'Đặt xe', color: 'YELLOW', main: false },
        { id: 'b3', x: 0, y: 0, text: 'Chuyến đi Đà Lạt', color: 'DEFAULT', main: true },
      ],
      links: [{ id: 'l1', from: 'b3', fromSide: 'RIGHT', to: 'b1', toSide: 'LEFT', label: 'chỗ ở' }],
    },
    ...extra,
  })

const anchor = (extra: Partial<NoteAnchor>): NoteAnchor => ({
  kind: 'MESSAGE',
  provider: 'gmail',
  conversationKind: 'EMAIL',
  label: 'Trần Minh Anh',
  subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
  conversationId: 'conv-1',
  missing: false,
  ...extra,
})

describe('notes sample data', () => {
  it('holds the six notes of the canvas and one diagram, pinned first, the newest edit first in each group (D-205)', () => {
    const { pinned, recent } = groupNotes(createNotesSample(now).notes)

    expect(titles(pinned)).toEqual(['Danh sách mua cho bà', 'Mã khách hàng phòng khám'])
    expect(titles(recent)).toEqual([
      'Điều khoản 4 — thời hạn thanh toán',
      'Hoàng thích nhận file qua Drive',
      'Số hợp đồng bảo hiểm',
      'Ý tưởng chuyến đi Đà Lạt tháng 12',
      'Kế hoạch chuyến đi Đà Lạt',
    ])
    expect([...pinned, ...recent].map((entry) => noteTime(entry.updatedAt, now, TZ))).toEqual(['08:31', 'Hôm qua', '09:52', '29/09', '27/09', '25/09', '24/09'])
    const plan = recent.at(-1)!
    expect(plan).toMatchObject({ kind: 'DIAGRAM', body: '' })
    expect(noteSource(plan).text).toBe('Sơ đồ · 7 khối · 6 nối')
  })
})

describe('the list', () => {
  it('names a note by its title, else by the first line of its text (D-202)', () => {
    expect(noteTitle(note({ title: 'Mã khách hàng' }))).toBe('Mã khách hàng')
    expect(noteTitle(note({ title: null, body: '\n  Gọi lại cho phòng khám  \nmang CCCD' }))).toBe('Gọi lại cho phòng khám')
    expect(noteTitle(note({ title: '   ', body: 'Dòng đầu' }))).toBe('Dòng đầu')
  })

  it('dates an edit: today by the clock, yesterday by name, older by the day', () => {
    expect(noteTime(vn('2026-10-02T09:52'), now, TZ)).toBe('09:52')
    expect(noteTime(vn('2026-10-01T23:59'), now, TZ)).toBe('Hôm qua')
    expect(noteTime(vn('2026-09-29T10:00'), now, TZ)).toBe('29/09')
    expect(noteTime(vn('2025-12-29T10:00'), now, TZ)).toBe('29/12/2025')
  })

  it('says where a note comes from (D-204)', () => {
    expect(noteSource(note({ anchor: anchor({}) }))).toEqual({ tone: 'anchor', text: 'Thư · Trần Minh Anh' })
    expect(noteSource(note({ anchor: anchor({ conversationKind: 'CHAT', label: 'Gia đình', provider: 'zalo' }) }))).toEqual({ tone: 'anchor', text: 'Tin nhắn · Gia đình' })
    expect(noteSource(note({ anchor: anchor({ kind: 'CONVERSATION', label: 'Gia đình' }) }))).toEqual({ tone: 'anchor', text: 'Cuộc trò chuyện · Gia đình' })
    expect(noteSource(note({ anchor: anchor({ kind: 'PARTICIPANT', label: 'Lê Hoàng', conversationKind: null, conversationId: null }) }))).toEqual({
      tone: 'anchor',
      text: 'Người · Lê Hoàng',
    })
    expect(noteSource(note({ anchor: anchor({ missing: true }) }))).toEqual({ tone: 'missing', text: 'Tin nhắn gốc không còn' })
    expect(noteSource(note({}))).toEqual({ tone: 'standalone', text: 'Ghi chú độc lập' })
  })

  it('filters by anchor and pin, and searches title and text without case or accents (D-205)', () => {
    const notes = [
      note({ id: 'clause', title: 'Điều khoản 4 — thời hạn THANH TOÁN', anchor: anchor({}) }),
      note({ id: 'trip', title: 'Đà Lạt', body: 'Thuê homestay gần hồ', pinned: true }),
      note({ id: 'đ', title: null, body: 'Đường về nhà' }),
    ]
    const ids = (found: NoteItem[]) => found.map((entry) => entry.id)

    expect(ids(filterNotes(notes, 'all', ''))).toEqual(['clause', 'trip', 'đ'])
    expect(ids(filterNotes(notes, 'linked', ''))).toEqual(['clause'])
    expect(ids(filterNotes(notes, 'pinned', ''))).toEqual(['trip'])
    expect(ids(filterNotes(notes, 'all', '  thanh toan '))).toEqual(['clause'])
    expect(ids(filterNotes(notes, 'all', 'HOMESTAY'))).toEqual(['trip'])
    expect(ids(filterNotes(notes, 'all', 'duong ve'))).toEqual(['đ'])
    expect(ids(filterNotes(notes, 'pinned', 'thanh toan'))).toEqual([])
    expect(noteCounts(notes)).toEqual({ all: 3, linked: 1, pinned: 1, diagram: 0 })
  })
})

describe('diagram notes in the list (DG-01, fe-ui-diagram-notes)', () => {
  it('names a diagram by its title, else by its main block, else "Sơ đồ mới" (D-206)', () => {
    expect(noteTitle(diagramNote({ title: 'Kế hoạch' }))).toBe('Kế hoạch')
    expect(noteTitle(diagramNote())).toBe('Chuyến đi Đà Lạt')
    expect(noteTitle(diagramNote({ diagram: { blocks: [], links: [] } }))).toBe('Sơ đồ mới')
  })

  it('previews a diagram by its blocks, the main one first, on one line', () => {
    expect(notePreview(diagramNote())).toBe('Chuyến đi Đà Lạt · Thuê homestay gần hồ · Đặt xe')
    expect(notePreview(note({ body: 'Mã KH: AD-55120.' }))).toBe('Mã KH: AD-55120.')
  })

  it('says it is a diagram, with its blocks and links', () => {
    expect(noteSource(diagramNote())).toEqual({ tone: 'diagram', text: 'Sơ đồ · 3 khối · 1 nối' })
  })

  it('filters the diagrams, and finds a diagram by the words of its blocks and links', () => {
    const notes = [note({ id: 'text' }), diagramNote({ id: 'plan' })]
    const ids = (found: NoteItem[]) => found.map((entry) => entry.id)

    expect(ids(filterNotes(notes, 'diagram', ''))).toEqual(['plan'])
    expect(ids(filterNotes(notes, 'all', 'homestay'))).toEqual(['plan'])
    expect(ids(filterNotes(notes, 'all', 'cho o'))).toEqual(['plan'])
    expect(noteCounts(notes)).toEqual({ all: 2, linked: 0, pinned: 0, diagram: 1 })
  })
})

describe('the editor', () => {
  it('says what a note is tied to, and opens the conversation in the chip (D-204)', () => {
    expect(anchorHeading(anchor({}))).toBe('Gắn với thư')
    expect(anchorHeading(anchor({ conversationKind: 'CHAT' }))).toBe('Gắn với tin nhắn')
    expect(anchorHeading(anchor({ kind: 'CONVERSATION' }))).toBe('Gắn với cuộc trò chuyện')
    expect(anchorHeading(anchor({ kind: 'PARTICIPANT' }))).toBe('Gắn với người')
    expect(anchorChip(anchor({}))).toBe('Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2')
    expect(anchorChip(anchor({ subject: null, label: 'Gia đình' }))).toBe('Gia đình')
  })

  it('heads the quote with where and when it was written', () => {
    expect(quoteHeading(anchor({}), vn('2026-10-02T09:41'), now, TZ)).toBe('TRÍCH TỪ THƯ · 09:41 HÔM NAY')
    expect(quoteHeading(anchor({ conversationKind: 'CHAT' }), vn('2026-10-01T21:02'), now, TZ)).toBe('TRÍCH TỪ TIN NHẮN · 21:02 HÔM QUA')
    expect(quoteHeading(null, vn('2026-09-28T16:20'), now, TZ)).toBe('TRÍCH · 28/09 · 16:20')
  })

  it('says when it was saved and how long it is (D-203)', () => {
    expect(editedLine(vn('2026-10-02T09:52'), now, TZ)).toBe('Sửa lúc 09:52 hôm nay · tự lưu')
    expect(editedLine(vn('2026-09-29T10:00'), now, TZ)).toBe('Sửa lúc 29/09 · 10:00 · tự lưu')
    expect(savedLine(vn('2026-10-02T09:52'), now, TZ)).toBe('TỰ LƯU · 09:52')
    expect(savedLine(vn('2026-09-29T10:00'), now, TZ)).toBe('TỰ LƯU · 29/09')
    expect(lengthLine('a'.repeat(214))).toBe('214 / 20.000 ký tự')
    expect(lengthLine('a'.repeat(12_345))).toBe('12.345 / 20.000 ký tự')
  })

  it('dates a related task by its due', () => {
    expect(linkedDue({ dueAt: vn('2026-10-07T17:00'), dueDate: null }, TZ)).toBe('hạn T4 07/10')
    expect(linkedDue({ dueAt: null, dueDate: '2026-10-09' }, TZ)).toBe('hạn T6 09/10')
    // A whole day stays that day for a reader 14 hours ahead of UTC (found by a mutation check, NT-03).
    expect(linkedDue({ dueAt: null, dueDate: '2026-10-09' }, 'Pacific/Kiritimati')).toBe('hạn T6 09/10')
    expect(linkedDue({ dueAt: null, dueDate: null }, TZ)).toBeNull()
  })
})
