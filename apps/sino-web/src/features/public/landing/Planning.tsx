// Copied from apps/sino-site/src/pages/messages/Planning.tsx (web-public-pages, D-312); the only copy since sino-site was removed (tag sino-site-v0).
import { Check, ChevronRight, Plus, Repeat, SquareCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { MagicBentoCard } from '../motion/MagicBento'
import { ICON, microLabel, spec } from '../ui'
import { SectionHead, SOON, sectionClass } from './SectionHead'

const POINTS = [
  'Việc gọn: hạn, giờ, lặp lại, ghi chú. Không biến thành một ứng dụng quản lý dự án.',
  'Lặp hằng ngày, hằng tuần, hằng tháng hay hằng năm, tính theo giờ Việt Nam.',
  'Mọi thứ nằm trong Sino; không cần đồng bộ sang ứng dụng khác.',
]

const TODAY: { when: string; title: string; note?: ReactNode; over?: boolean }[] = [
  {
    when: '30/09',
    title: 'Gửi lại hóa đơn tháng 9 cho kế toán',
    note: <span className="text-sm leading-5 text-danger-ink">Quá hạn 2 ngày</span>,
    over: true,
  },
  { when: '16:00', title: 'Gọi Minh Anh về phụ lục giá' },
  {
    when: '17:00',
    title: 'Chuyển tiền nhà tháng 10',
    note: (
      <span className="inline-flex items-center gap-[5px] text-xs leading-4 font-medium text-muted-foreground">
        <Repeat {...ICON} className="size-[13px]" />
        Hằng tháng
      </span>
    ),
  },
  { when: '18:00', title: 'Mua bánh bông lan trứng muối cho bà' },
]

const point = 'grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 text-base leading-6'

/** Canvas `#ke-hoach`: to-dos next to the inbox; making them from a message is "Sắp có" (D-241). */
export function Planning() {
  return (
    <section id="ke-hoach" aria-labelledby="h-ke-hoach" className={sectionClass}>
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-16">
        <div className="flex flex-col gap-6">
          <SectionHead label="KẾ HOẠCH" id="h-ke-hoach" title="Việc cần làm ở ngay cạnh hộp thư." />
          <ul className="flex flex-col gap-3.5">
            {POINTS.map((text) => (
              <li key={text} className={cn(point, 'text-foreground')}>
                <Check {...ICON} className="mt-[3px] size-4.5 text-success-ink" />
                <span>{text}</span>
              </li>
            ))}
            <li data-soon className={cn(point, 'text-muted-foreground')}>
              <Plus {...ICON} className="mt-[3px] size-4.5" />
              <span>
                Tạo việc, lịch hẹn và ghi chú ngay từ một thư, bấm là về đúng thư gốc. <Badge className="align-middle">{SOON}</Badge>
              </span>
            </li>
          </ul>
          <Button asChild variant="secondary" className="self-start">
            <Link to="/tasks">
              Mở Việc cần làm
              <ChevronRight {...ICON} />
            </Link>
          </Button>
        </div>
        <MagicBentoCard className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className={microLabel}>Hôm nay · Thứ Sáu 02/10</span>
            <span className={spec}>4 việc</span>
          </div>
          <div className="-mx-3 flex flex-col gap-0.5">
            {TODAY.map((t) => (
              <div
                key={t.title}
                className="grid grid-cols-[52px_18px_minmax(0,1fr)] items-center gap-x-3 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-hover) ease-out hover:bg-hover"
              >
                <span className={cn(spec, 'text-foreground', t.over && 'text-danger-ink')}>{t.when}</span>
                <SquareCheck {...ICON} className={cn('size-4.5 text-muted-foreground', t.over && 'text-danger-ink')} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm leading-5 font-semibold">{t.title}</span>
                  {t.note}
                </div>
              </div>
            ))}
          </div>
        </MagicBentoCard>
      </div>
    </section>
  )
}
