import { Eye, Key, Lock, SquareCheck } from 'lucide-react'
import { eyebrow } from '@/shared/ui/text'
import { CardCopy, FeatureIcon } from './Features'
import { SectionHead, sectionClass } from './SectionHead'

const ITEMS = [
  {
    icon: Lock,
    title: 'Thông tin đăng nhập được mã hóa',
    body: 'Token Google của từng tài khoản được mã hóa AES-256-GCM trước khi lưu; khóa mã hóa được giữ tách khỏi cơ sở dữ liệu.',
  },
  {
    icon: Eye,
    title: 'Chỉ xin quyền cần dùng',
    body: 'Sino đọc thư và gửi thư trả lời. Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ.',
  },
  {
    icon: SquareCheck,
    title: 'Bạn xem quyền trước khi đồng ý',
    body: 'Sino liệt kê quyền nó xin trước khi chuyển bạn sang Google, và Google hỏi lại trên trang đồng ý của chính Google.',
  },
  {
    icon: Key,
    title: 'Thu hồi bất cứ lúc nào',
    body: 'Ngắt kết nối trong Sino thì quyền bị thu hồi ở Google và token bị xóa khỏi Sino.',
  },
]

const SCOPES = [
  {
    scope: 'openid',
    name: 'Xác nhận tài khoản Google',
    reason: 'Biết chắc tài khoản vừa kết nối là tài khoản Google nào, để không kết nối một tài khoản hai lần.',
  },
  { scope: 'email', name: 'Địa chỉ email', reason: 'Ghi địa chỉ Gmail cạnh mỗi thư, để bạn biết thư đến tài khoản nào.' },
  {
    scope: 'gmail.readonly',
    name: 'Đọc thư',
    reason:
      'Đọc thư và tệp đính kèm để hiện trong hộp thư chung của bạn. Quyền này không cho Sino xóa hay sửa thư trong Gmail.',
  },
  { scope: 'gmail.send', name: 'Gửi thư', reason: 'Gửi thư trả lời khi bạn bấm Gửi trong Sino. Sino không tự gửi thư nào.' },
]

/** Canvas `#rieng-tu`, plus what Sino asks Google for and why (D-245): Google reads this before it verifies the app. */
export function Privacy() {
  return (
    <section id="rieng-tu" aria-labelledby="h-rieng-tu" className={sectionClass}>
      <SectionHead label="QUYỀN RIÊNG TƯ" id="h-rieng-tu" title="Riêng tư là mặc định, không phải một tùy chọn." />
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-12">
        {ITEMS.map((item) => (
          <div
            key={item.title}
            className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4.5 border-t border-border py-5.5 md:py-7"
          >
            <FeatureIcon icon={item.icon} />
            <CardCopy title={item.title}>{item.body}</CardCopy>
          </div>
        ))}
      </div>
      <div aria-labelledby="h-quyen-google" className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 md:p-7">
        <div className="flex max-w-190 flex-col gap-3.5">
          <span className={eyebrow}>QUYỀN GOOGLE</span>
          <h3 className="text-xl leading-7 font-semibold tracking-[-0.01em]" id="h-quyen-google">
            Sino xin gì từ tài khoản Google của bạn, và để làm gì.
          </h3>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 md:gap-x-12">
          {SCOPES.map((s) => (
            <div key={s.scope} data-slot="scope" className="flex flex-col gap-1.5 border-t border-border py-4.5">
              <dt className="flex flex-wrap items-center gap-2.5 text-[15px] leading-[22px] font-semibold">
                <code className="rounded-xs border border-border-strong bg-raised px-1.5 py-0.5 font-mono text-xs leading-4 font-medium">
                  {s.scope}
                </code>
                <span>{s.name}</span>
              </dt>
              <dd className="text-[15px] leading-6 text-muted-foreground">{s.reason}</dd>
            </div>
          ))}
        </dl>
        <p className="max-w-220 text-sm leading-[22px] text-muted-foreground">
          Việc Sino sử dụng và chuyển giao thông tin nhận được từ Google API tuân thủ Chính sách dữ liệu người dùng của Dịch vụ
          API Google (Google API Services User Data Policy), bao gồm các yêu cầu Sử dụng giới hạn (Limited Use).{' '}
          <a className="text-foreground underline underline-offset-3" href="/privacy#google">
            Đọc thêm trong Chính sách quyền riêng tư
          </a>
        </p>
      </div>
    </section>
  )
}
