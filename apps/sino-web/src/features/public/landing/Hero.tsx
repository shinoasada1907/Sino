// Copied from apps/sino-site/src/pages/messages/Hero.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { ChevronRight, Eye, Key, Lock, Reply, SquareCheck } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { AnimatedList } from '../motion/AnimatedList'
import { BorderGlow } from '../motion/BorderGlow'
import { SpotlightCard } from '../motion/SpotlightCard'
import { eyebrow, ICON, lead, spec } from '../ui'
import { MailRow, type Mail } from './MailRow'

/** Canvas `.anim-enter d1/d2/d3`: CSS, so the hero comes in as soon as it is drawn (sino-site D-252). */
const enter = 'motion-safe:animate-enter motion-reduce:animate-fade-in'
const d2 = '[animation-delay:40ms]'
const d3 = '[animation-delay:80ms]'

const MAILS: Mail[] = [
  {
    sender: 'Trần Minh Anh',
    subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
    preview: 'Anh xem giúp và phản hồi trước thứ Tư 07/10 nhé.',
    time: '09:41',
    selected: true,
    flag: (
      <>
        <Reply {...ICON} />
        Cần trả lời
      </>
    ),
  },
  {
    sender: 'Phòng khám Ánh Dương',
    subject: 'Lịch khám thứ Hai 05/10',
    preview: 'Quý khách có lịch khám lúc 08:30.',
    time: '08:15',
    unread: true,
    count: 2,
  },
  {
    sender: 'Nguyễn Thị Hoa',
    subject: 'Cuối tuần cả nhà về ăn cơm',
    preview: 'Nhớ mua bánh bông lan trứng muối cho bà nhé con.',
    time: '07:30',
    unread: true,
  },
  { sender: 'Lê Hoàng', subject: 'File thiết kế bản cuối', preview: 'Mình gửi kèm file, bạn xem rồi góp ý nhé.', time: 'Hôm qua' },
]

const TRUST = [
  { icon: Lock, text: 'Token được mã hóa trước khi lưu' },
  { icon: Eye, text: 'Chỉ xin quyền đọc và gửi thư' },
  { icon: Key, text: 'Thu hồi quyền bất cứ lúc nào' },
]

/** Canvas `lp-hero`: what Sino is, and a picture of the unified inbox with Gmail mail only (D-241). */
export function Hero() {
  return (
    <section
      id="dau-trang"
      aria-label="Giới thiệu"
      className="grid grid-cols-1 items-center gap-14 pt-10 pb-18 md:gap-18 md:pt-24 md:pb-22 lg:grid-cols-2 lg:gap-14"
    >
      <div className="flex flex-col items-start gap-6">
        <span className={cn(eyebrow, enter)}>HỘP THƯ CHUNG · VIỆC CẦN LÀM</span>
        <h1
          className={cn(
            'text-[38px] leading-11 font-bold tracking-[-0.04em] text-foreground md:text-[64px] md:leading-[70px]',
            enter,
          )}
        >
          Mọi hộp thư Gmail ở một nơi. Việc cần làm ngay bên cạnh.
        </h1>
        <p className={cn(lead, enter, d2)}>
          Sino gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và ghi việc cần làm ở cùng một chỗ, không
          phải mở từng tài khoản. Zalo, Messenger và Telegram sẽ đến sau.
        </p>
        <div data-slot="cta" className={cn('flex w-full flex-wrap gap-3 max-md:*:grow', enter, d2)}>
          <BorderGlow>
            <Button asChild className="w-full">
              <Link to="/overview">
                Mở Sino Messages
                <ChevronRight {...ICON} />
              </Link>
            </Button>
          </BorderGlow>
          <Button asChild variant="secondary">
            <Link to={{ hash: 'cach-hoat-dong' }}>Xem cách hoạt động</Link>
          </Button>
        </div>
        <div className={cn('flex flex-wrap gap-x-5 gap-y-2', enter, d3)}>
          {TRUST.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex items-center gap-[5px] text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground"
            >
              <Icon {...ICON} className="size-[13px]" />
              {text}
            </span>
          ))}
        </div>
      </div>

      <SpotlightCard
        role="img"
        aria-label="Ảnh minh họa hộp thư chung của Sino với thư từ hai tài khoản Gmail, một việc cần làm và một thư trả lời đã gửi"
        className={cn(
          'flex w-full flex-col gap-1 rounded-[24px] border border-border-strong bg-surface p-3.5 shadow-popover md:max-w-160 lg:max-w-none',
          'bg-[radial-gradient(520px_circle_at_80%_0%,var(--spot-strong),transparent_60%)]',
          enter,
          d3,
        )}
      >
        <div className="flex items-center gap-1.5 px-1.5 pt-1 pb-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-border-strong" />
          ))}
          <span className={cn(spec, 'ml-2.5')}>HỘP THƯ CHUNG · 2 TÀI KHOẢN GMAIL</span>
        </div>
        <AnimatedList delay={200} className="flex flex-col gap-1">
          {MAILS.map((mail) => (
            <MailRow key={mail.sender} mail={mail} className="p-3" />
          ))}
        </AnimatedList>
        <div className="absolute top-13 right-2 z-2 md:top-[74px] md:-right-[18px]">
          <span className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-border bg-raised pr-3 pl-2.5 text-xs leading-4 font-medium whitespace-nowrap text-foreground shadow-popover">
            <SquareCheck {...ICON} className="size-3.5 text-muted-foreground" />
            <span>Gửi lại hợp đồng</span>
            <span className={cn(spec, 'truncate')}>hạn T4 07/10</span>
          </span>
        </div>
        <div className="absolute right-2 -bottom-12 left-2 z-2 rounded-[16px] border border-border-strong bg-raised p-3.5 shadow-popover md:right-auto md:-bottom-9 md:-left-10 md:w-85">
          <div className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-x-3">
            <span className="grid size-8 place-items-center rounded-[9px] border border-border bg-surface text-foreground">
              <Reply {...ICON} className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm leading-5 font-semibold">Đã trả lời Trần Minh Anh</span>
              <span className={spec}>TRONG CÙNG CHUỖI THƯ · 09:52</span>
            </div>
          </div>
        </div>
      </SpotlightCard>
    </section>
  )
}
