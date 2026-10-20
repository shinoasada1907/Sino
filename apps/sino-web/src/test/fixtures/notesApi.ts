import type { Diagram, NoteItem } from '@/features/notes/notes.types'

/**
 * `GET /api/notes` items as the backend answers them (F15, BE-91), around Friday 2 October 2026, 14:05 in Vietnam:
 * a pinned text note edited this morning, a text note without a title from September, and a diagram of two blocks and
 * one arrow edited yesterday. None is tied to a message (D-177): `anchor` and `quote` are null, `linked` is empty.
 */
export const API_NOTES: NoteItem[] = [
  note({
    id: 'note-gran',
    title: 'Danh sách mua cho bà',
    body: 'Bánh bông lan trứng muối (2 hộp), trà sen, một ít cam.',
    pinned: true,
    createdAt: '2026-10-02T01:20:00Z',
    updatedAt: '2026-10-02T01:31:00Z',
    version: 2,
  }),
  note({
    id: 'note-trip',
    body: 'Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm.',
    createdAt: '2026-09-25T14:00:00Z',
    updatedAt: '2026-09-25T14:10:00Z',
  }),
  diagramNote({
    id: 'note-plan',
    title: 'Kế hoạch chuyến đi Đà Lạt',
    createdAt: '2026-10-01T08:30:00Z',
    updatedAt: '2026-10-01T09:30:00Z',
    version: 4,
    diagram: {
      blocks: [
        { id: 'plan-trip', x: 360, y: 230, text: 'Chuyến đi Đà Lạt', color: 'YELLOW', main: true },
        { id: 'plan-stay', x: 640, y: 90, text: 'Thuê homestay', color: 'DEFAULT', main: false },
      ],
      links: [{ id: 'plan-l1', from: 'plan-trip', fromSide: 'RIGHT', to: 'plan-stay', toSide: 'LEFT', label: 'chỗ ở' }],
    },
  }),
]

/** A text note as the API sends it, with the fields this backend leaves empty. */
export function note(fields: Partial<NoteItem> & Pick<NoteItem, 'id' | 'body'>): NoteItem {
  return {
    kind: 'TEXT',
    title: null,
    diagram: null,
    pinned: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    version: 0,
    anchor: null,
    quote: null,
    linked: [],
    ...fields,
  }
}

/** A diagram note as the API sends it: its body is empty. */
export function diagramNote(fields: Partial<NoteItem> & Pick<NoteItem, 'id'> & { diagram: Diagram }): NoteItem {
  return note({ body: '', ...fields, kind: 'DIAGRAM' })
}
