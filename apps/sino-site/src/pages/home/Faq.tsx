import { Plus } from 'lucide-react'
import { ICON } from '@/shared/ui/icon'
import { SectionHead, sectionClass } from './SectionHead'

const QUESTIONS = [
  {
    q: 'Sino hỗ trợ những dịch vụ nào?',
    a: 'Hiện tại là Gmail, nhiều tài khoản cùng lúc. Zalo, Messenger và Telegram sẽ được thêm dần. Với mỗi dịch vụ, Sino chỉ hiện những thao tác dịch vụ đó cho phép.',
  },
  {
    q: 'Sino có dùng thư của tôi để quảng cáo hay huấn luyện AI không?',
    a: 'Không. Thư chỉ dùng để hiện trong Sino của bạn và để gửi thư trả lời bạn viết. Sino không bán dữ liệu, không quảng cáo và không dùng thư để huấn luyện mô hình AI.',
  },
  {
    q: 'Ngắt kết nối thì thư đã lưu có bị xóa không?',
    a: 'Ngắt kết nối thu hồi quyền ở Google ngay và xóa token. Thư đã lưu được giữ lại nhưng không hiện nữa, để kết nối lại không phải nhập lại từ đầu. Muốn xóa hẳn, hãy gửi yêu cầu theo cách ghi trong Chính sách quyền riêng tư.',
  },
  {
    q: 'Nếu gửi thư bị lỗi giữa chừng thì sao?',
    a: 'Sino không bao giờ tự gửi lại khi không chắc thư đã đi hay chưa, để người nhận không nhận hai lần. Thư được giữ lại, kèm nút Gửi lại hoặc Bỏ.',
  },
  {
    q: 'Lịch của Sino có đồng bộ với Google Calendar không?',
    a: 'Không. Sino không xin quyền Google Calendar. Lịch hẹn đang được làm và sẽ nằm trong Sino.',
  },
  {
    q: 'Có ứng dụng cho điện thoại không?',
    a: 'Bạn dùng Sino trên trình duyệt của điện thoại; giao diện tự xếp lại theo màn hình. Ứng dụng riêng sẽ có sau.',
  },
]

/** Canvas `#cau-hoi`: <details>, so the answers open without JavaScript too (D-247); the first one starts open. */
export function Faq() {
  return (
    <section id="cau-hoi" aria-labelledby="h-cau-hoi" className={sectionClass}>
      <SectionHead label="CÂU HỎI THƯỜNG GẶP" id="h-cau-hoi" title="Trước khi bắt đầu." />
      <div className="flex max-w-220 flex-col">
        {QUESTIONS.map(({ q, a }, i) => (
          <details key={q} className="group" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 border-t border-border py-5.5 text-base leading-6 font-semibold text-foreground md:text-[17px] [&::-webkit-details-marker]:hidden">
              {q}
              <Plus
                {...ICON}
                className="size-4.5 shrink-0 text-muted-foreground transition-transform duration-(--dur-panel) ease-out group-open:rotate-45"
              />
            </summary>
            <p className="pb-6 text-base leading-[26px] text-muted-foreground md:pr-12">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
