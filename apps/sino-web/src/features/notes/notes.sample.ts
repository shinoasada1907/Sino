import { clockFrom } from '@/shared/time/canvasClock'
import type { DiagramBlock, NoteAnchor, NoteItem, NotesData } from './notes.types'

const anchor = (extra: Partial<NoteAnchor> & Pick<NoteAnchor, 'kind' | 'label'>): NoteAnchor => ({
  provider: 'gmail',
  conversationKind: 'EMAIL',
  subject: null,
  conversationId: null,
  missing: false,
  ...extra,
})

const text = (note: Omit<NoteItem, 'kind' | 'diagram'>): NoteItem => ({ ...note, kind: 'TEXT', diagram: null })

/**
 * Sample data shaped like the "Sino UI" canvas (`Notes`, `MobileNotes`, `MobileNoteEditor`), and the diagram of the
 * approved prototype (fe-ui-diagram-notes). The conversations and the task are those of the inbox and tasks samples.
 * Every time moves with `now`; at 14:05 it shows the canvas times.
 */
export function createNotesSample(now: Date): NotesData {
  const at = clockFrom(now)
  return {
    generatedAt: now.toISOString(),
    notes: [
      text({
        id: 'note-gran',
        title: 'Danh sách mua cho bà',
        body: 'Bánh bông lan trứng muối (2 hộp), trà sen, một ít cam.',
        pinned: true,
        createdAt: at('2026-10-02T08:20:00+07:00'),
        updatedAt: at('2026-10-02T08:31:00+07:00'),
        anchor: anchor({ kind: 'CONVERSATION', label: 'Gia đình', provider: 'zalo', conversationKind: 'CHAT', conversationId: 'conv-2' }),
        quote: null,
        linked: [],
      }),
      text({
        id: 'note-clinic',
        title: 'Mã khách hàng phòng khám',
        body: 'Mã KH: AD-55120. Mang theo CCCD và kết quả xét nghiệm lần trước.',
        pinned: true,
        createdAt: at('2026-10-01T16:40:00+07:00'),
        updatedAt: at('2026-10-01T16:45:00+07:00'),
        anchor: anchor({ kind: 'CONVERSATION', label: 'Phòng khám Ánh Dương', subject: 'Nhắc lịch khám thứ Hai 05/10', conversationId: 'conv-3' }),
        quote: null,
        linked: [],
      }),
      text({
        id: 'note-clause',
        title: 'Điều khoản 4 — thời hạn thanh toán',
        body: [
          'Thời hạn thanh toán đổi từ 15 xuống 10 ngày kể từ ngày nhận hóa đơn. Cần hỏi lại kế toán trước khi ký.',
          '',
          '- Hỏi lại kế toán xem 10 ngày có kịp không.',
          '- Nếu không kịp, đề nghị giữ 15 ngày và chấp nhận phụ lục giá mới.',
        ].join('\n'),
        pinned: false,
        createdAt: at('2026-10-02T09:45:00+07:00'),
        updatedAt: at('2026-10-02T09:52:00+07:00'),
        anchor: anchor({ kind: 'MESSAGE', label: 'Trần Minh Anh', subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2', conversationId: 'conv-1' }),
        quote: {
          text: 'Em gửi lại bản đã sửa điều khoản 4 (thời hạn thanh toán) và phụ lục giá theo trao đổi hôm thứ Tư.',
          at: at('2026-10-02T09:41:00+07:00'),
        },
        linked: [{ kind: 'TASK', id: 'task-contract', title: 'Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2', dueAt: at('2026-10-07T17:00:00+07:00'), dueDate: null }],
      }),
      text({
        id: 'note-hoang',
        title: 'Hoàng thích nhận file qua Drive',
        body: 'Đừng gửi file nặng qua Messenger; gửi link Drive, đặt tên theo ngày.',
        pinned: false,
        createdAt: at('2026-09-29T10:10:00+07:00'),
        updatedAt: at('2026-09-29T10:15:00+07:00'),
        anchor: anchor({ kind: 'PARTICIPANT', label: 'Lê Hoàng', provider: 'messenger', conversationKind: null }),
        quote: null,
        linked: [],
      }),
      text({
        id: 'note-insure',
        title: 'Số hợp đồng bảo hiểm',
        body: 'TA-2025-0418, hết hạn 15/10/2026. Phí năm nay 4.200.000 đ.',
        pinned: false,
        createdAt: at('2026-09-27T11:00:00+07:00'),
        updatedAt: at('2026-09-27T11:02:00+07:00'),
        anchor: anchor({ kind: 'MESSAGE', label: 'Bảo hiểm Toàn An', missing: true }),
        quote: null,
        linked: [],
      }),
      text({
        id: 'note-trip',
        title: 'Ý tưởng chuyến đi Đà Lạt tháng 12',
        body: 'Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm, rủ cả nhóm chạy bộ.',
        pinned: false,
        createdAt: at('2026-09-25T21:00:00+07:00'),
        updatedAt: at('2026-09-25T21:10:00+07:00'),
        anchor: null,
        quote: null,
        linked: [],
      }),
      tripPlan(at),
    ],
  }
}

/** The diagram of the prototype the user approved (fe-ui-diagram-notes): a trip plan, 7 blocks, 6 links. */
function tripPlan(at: (canvasTime: string) => string): NoteItem {
  const block = (id: string, x: number, y: number, text: string, color: DiagramBlock['color'] = 'DEFAULT', main = false): DiagramBlock => ({ id, x, y, text, color, main })
  return {
    id: 'note-plan',
    kind: 'DIAGRAM',
    title: 'Kế hoạch chuyến đi Đà Lạt',
    body: '',
    pinned: false,
    createdAt: at('2026-09-24T20:30:00+07:00'),
    updatedAt: at('2026-09-24T21:30:00+07:00'),
    anchor: null,
    quote: null,
    linked: [],
    diagram: {
      blocks: [
        block('plan-trip', 360, 230, 'Chuyến đi Đà Lạt\ntháng 12', 'YELLOW', true),
        block('plan-stay', 640, 90, 'Thuê homestay gần hồ Tuyền Lâm'),
        block('plan-crew', 640, 330, 'Rủ cả nhóm chạy bộ', 'GREEN'),
        block('plan-bus', 930, 330, 'Đặt xe 16 chỗ'),
        block('plan-budget', 930, 90, 'Ngân sách khoảng 3 triệu / người', 'RED'),
        block('plan-photos', 360, 40, 'Hỏi Thu Trang ảnh chuyến trước', 'BLUE'),
        block('plan-date', 640, 470, 'Chốt ngày trước 15/11'),
      ],
      links: [
        { id: 'plan-l1', from: 'plan-trip', fromSide: 'RIGHT', to: 'plan-stay', toSide: 'LEFT', label: 'chỗ ở' },
        { id: 'plan-l2', from: 'plan-trip', fromSide: 'RIGHT', to: 'plan-crew', toSide: 'LEFT', label: 'ai đi' },
        { id: 'plan-l3', from: 'plan-crew', fromSide: 'RIGHT', to: 'plan-bus', toSide: 'LEFT', label: 'đủ người thì' },
        { id: 'plan-l4', from: 'plan-stay', fromSide: 'RIGHT', to: 'plan-budget', toSide: 'LEFT', label: 'tính vào' },
        { id: 'plan-l5', from: 'plan-crew', fromSide: 'BOTTOM', to: 'plan-date', toSide: 'TOP', label: null },
        { id: 'plan-l6', from: 'plan-photos', fromSide: 'RIGHT', to: 'plan-stay', toSide: 'LEFT', label: 'chọn chỗ' },
      ],
    },
  }
}
