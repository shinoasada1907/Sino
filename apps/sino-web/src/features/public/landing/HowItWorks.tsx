// Copied from apps/sino-site/src/pages/messages/HowItWorks.tsx (web-public-pages, D-312); change both together.
import { SectionHead, sectionClass } from './SectionHead'

const STEPS = [
  {
    n: '01',
    title: 'Kết nối Gmail',
    body: 'Sino cho bạn xem lại từng quyền nó xin, rồi chuyển sang trang đăng nhập chính thức của Google. Mật khẩu Gmail không đi qua Sino.',
  },
  {
    n: '02',
    title: 'Sino nhập thư',
    body: 'Bạn chọn nhập 30 ngày, 90 ngày hay cả hộp thư. Sau đó thư mới tự hiện, không cần tải lại trang.',
  },
  {
    n: '03',
    title: 'Trả lời và lên việc',
    body: 'Trả lời ngay trong Sino, và ghi việc cần làm với hạn, giờ và lặp lại.',
  },
]

/** Canvas `#cach-hoat-dong`: the three steps, as the connect wizard really runs them. */
export function HowItWorks() {
  return (
    <section id="cach-hoat-dong" aria-labelledby="h-cach" className={sectionClass}>
      <SectionHead label="CÁCH HOẠT ĐỘNG" id="h-cach" title="Ba bước, vài phút." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <article key={s.n} className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-7">
            <span className="font-mono text-[40px] leading-11 font-medium tracking-[-0.04em] text-subtle-foreground">{s.n}</span>
            <h3 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{s.title}</h3>
            <p className="text-[15px] leading-6 text-muted-foreground">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
