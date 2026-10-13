import { clockFrom } from '@/shared/time/canvasClock'
import type { NoteAnchor, NotesData } from './notes.types'

const anchor = (extra: Partial<NoteAnchor> & Pick<NoteAnchor, 'kind' | 'label'>): NoteAnchor => ({
  provider: 'gmail',
  conversationKind: 'EMAIL',
  subject: null,
  conversationId: null,
  missing: false,
  ...extra,
})

/**
 * Sample data shaped like the "Sino UI" canvas (`Notes`, `MobileNotes`, `MobileNoteEditor`). The conversations and the
 * task are those of the inbox and tasks samples. Every time moves with `now`; at 14:05 it shows the canvas times.
 */
export function createNotesSample(now: Date): NotesData {
  const at = clockFrom(now)
  return {
    generatedAt: now.toISOString(),
    notes: [
      {
        id: 'note-gran',
        title: 'Danh sách mua cho bà',
        body: 'Bánh bông lan trứng muối (2 hộp), trà sen, một ít cam.',
        pinned: true,
        createdAt: at('2026-10-02T08:20:00+07:00'),
        updatedAt: at('2026-10-02T08:31:00+07:00'),
        anchor: anchor({ kind: 'CONVERSATION', label: 'Gia đình', provider: 'zalo', conversationKind: 'CHAT', conversationId: 'conv-2' }),
        quote: null,
        linked: [],
      },
      {
        id: 'note-clinic',
        title: 'Mã khách hàng phòng khám',
        body: 'Mã KH: AD-55120. Mang theo CCCD và kết quả xét nghiệm lần trước.',
        pinned: true,
        createdAt: at('2026-10-01T16:40:00+07:00'),
        updatedAt: at('2026-10-01T16:45:00+07:00'),
        anchor: anchor({ kind: 'CONVERSATION', label: 'Phòng khám Ánh Dương', subject: 'Nhắc lịch khám thứ Hai 05/10', conversationId: 'conv-3' }),
        quote: null,
        linked: [],
      },
      {
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
      },
      {
        id: 'note-hoang',
        title: 'Hoàng thích nhận file qua Drive',
        body: 'Đừng gửi file nặng qua Messenger; gửi link Drive, đặt tên theo ngày.',
        pinned: false,
        createdAt: at('2026-09-29T10:10:00+07:00'),
        updatedAt: at('2026-09-29T10:15:00+07:00'),
        anchor: anchor({ kind: 'PARTICIPANT', label: 'Lê Hoàng', provider: 'messenger', conversationKind: null }),
        quote: null,
        linked: [],
      },
      {
        id: 'note-insure',
        title: 'Số hợp đồng bảo hiểm',
        body: 'TA-2025-0418, hết hạn 15/10/2026. Phí năm nay 4.200.000 đ.',
        pinned: false,
        createdAt: at('2026-09-27T11:00:00+07:00'),
        updatedAt: at('2026-09-27T11:02:00+07:00'),
        anchor: anchor({ kind: 'MESSAGE', label: 'Bảo hiểm Toàn An', missing: true }),
        quote: null,
        linked: [],
      },
      {
        id: 'note-trip',
        title: 'Ý tưởng chuyến đi Đà Lạt tháng 12',
        body: 'Thuê homestay gần hồ Tuyền Lâm, đi 3 ngày 2 đêm, rủ cả nhóm chạy bộ.',
        pinned: false,
        createdAt: at('2026-09-25T21:00:00+07:00'),
        updatedAt: at('2026-09-25T21:10:00+07:00'),
        anchor: null,
        quote: null,
        linked: [],
      },
    ],
  }
}
