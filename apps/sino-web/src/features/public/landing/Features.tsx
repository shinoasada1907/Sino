// Copied from apps/sino-site/src/pages/messages/Features.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { Calendar, Check, Eye, Inbox, RefreshCw, Repeat, Reply, SquareCheck, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { MagicBento, MagicBentoCard } from '../motion/MagicBento'
import { Badge } from '@/shared/ui/badge'
import { ICON } from '../ui'
import { MailRow } from './MailRow'
import { SectionHead, SOON, sectionClass } from './SectionHead'

/** Canvas `lp-fic`: the icon tile of a feature card. */
export function FeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-border-strong bg-raised text-foreground">
      <Icon {...ICON} className="size-5" />
    </span>
  )
}

/** Canvas `lp-card-copy`. */
export function CardCopy({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xl leading-7 font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="text-[15px] leading-6 text-muted-foreground">{children}</p>
    </div>
  )
}

const card = 'flex flex-col gap-4.5'
const meta = 'inline-flex items-center gap-[5px] text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground'

/** Canvas `#tinh-nang`: six cards, only what runs today; calendar and notes are "Sắp có" (D-241). */
export function Features() {
  return (
    <section id="tinh-nang" aria-labelledby="h-tinh-nang" className={sectionClass}>
      <SectionHead
        label="TÍNH NĂNG"
        id="h-tinh-nang"
        title="Một hộp thư làm được nhiều hơn đọc thư."
        lead="Mỗi tài khoản vẫn là của bạn. Sino chỉ bỏ đi việc phải mở từng hộp thư để biết ai đang chờ mình."
      />
      <MagicBento>
        <article
          className={cn(
            card,
            'relative overflow-hidden rounded-lg border border-border-strong bg-raised p-7 md:col-span-7 md:row-span-2',
            'bg-[radial-gradient(520px_circle_at_18%_0%,var(--spot),transparent_62%)]',
          )}
        >
          <FeatureIcon icon={Inbox} />
          <CardCopy title="Hộp thư hợp nhất">
            Thư từ mọi tài khoản Gmail của bạn xếp chung theo thời gian, mỗi dòng ghi rõ tài khoản nhận. Lọc thư chưa đọc, thư cần
            trả lời hay thư đã lưu trữ.
          </CardCopy>
          <div className="-mx-2.5 mt-1 -mb-1.5 flex flex-col gap-0.5">
            <MailRow
              className="p-2.5"
              mail={{
                sender: 'Trần Minh Anh',
                subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
                preview: 'Anh xem giúp và phản hồi trước thứ Tư nhé.',
                time: '09:41',
                unread: true,
              }}
            />
            <MailRow
              className="p-2.5"
              mail={{
                sender: 'Phòng khám Ánh Dương',
                subject: 'Lịch khám thứ Hai 05/10',
                preview: 'Quý khách có lịch khám lúc 08:30.',
                time: '08:15',
                unread: true,
                count: 2,
              }}
            />
            <MailRow
              className="p-2.5"
              mail={{
                sender: 'Lê Hoàng',
                subject: 'File thiết kế bản cuối',
                preview: 'Mình gửi kèm file, bạn xem rồi góp ý nhé.',
                time: 'Hôm qua',
              }}
            />
          </div>
        </article>
        <MagicBentoCard className={cn(card, 'md:col-span-5')}>
          <FeatureIcon icon={RefreshCw} />
          <CardCopy title="Thư mới tự hiện">
            Có thư mới là hộp thư cập nhật ngay, không cần tải lại trang. Lỗi của từng tài khoản hiện đúng chỗ.
          </CardCopy>
          <span className="inline-flex items-center gap-2 text-[13px] leading-[18px] font-medium whitespace-nowrap text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_20%,transparent)]" />
            Đang nhận thư mới
          </span>
        </MagicBentoCard>
        <MagicBentoCard className={cn(card, 'md:col-span-5')}>
          <FeatureIcon icon={Reply} />
          <CardCopy title="Trả lời ngay trong Sino">
            Thư trả lời đi từ đúng tài khoản đã nhận và nằm trong đúng chuỗi thư. Mạng chập chờn cũng không làm thư gửi hai lần.
          </CardCopy>
          <span className="inline-flex h-7 items-center gap-1.5 self-start rounded-full border border-border-strong px-2.5 text-xs leading-4 font-medium text-foreground">
            <Check {...ICON} className="size-[13px]" />
            Đã gửi · 09:52
          </span>
        </MagicBentoCard>
        <MagicBentoCard className={cn(card, 'md:col-span-4')}>
          <FeatureIcon icon={Eye} />
          <CardCopy title="Đọc thư an toàn">
            Thư HTML hiện trong một khung cách ly. Ảnh trong thư chỉ tải khi bạn bấm Hiện ảnh, để người gửi không biết bạn đã mở
            thư.
          </CardCopy>
        </MagicBentoCard>
        <MagicBentoCard className={cn(card, 'md:col-span-4')}>
          <FeatureIcon icon={SquareCheck} />
          <CardCopy title="Việc cần làm">
            Mỗi việc có hạn, giờ, lặp lại và ghi chú. Việc quá hạn được nêu rõ, việc lặp tự sang lần kế tiếp.
          </CardCopy>
          <span className={meta}>
            <Repeat {...ICON} className="size-[13px]" />
            Mỗi thứ Hai
          </span>
        </MagicBentoCard>
        <MagicBentoCard data-soon className={cn(card, 'md:col-span-4')}>
          <FeatureIcon icon={Calendar} />
          <CardCopy
            title={
              <>
                Lịch hẹn và ghi chú <Badge className="align-middle">{SOON}</Badge>
              </>
            }
          >
            Lịch hẹn lặp lại và ghi chú gắn với một thư, ở cùng chỗ với hộp thư.
          </CardCopy>
        </MagicBentoCard>
      </MagicBento>
    </section>
  )
}
