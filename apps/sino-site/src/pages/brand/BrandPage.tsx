import { ChevronRight, Inbox } from 'lucide-react'
import { FeatureIcon } from '@/pages/messages/Features'
import { MailRow } from '@/pages/messages/MailRow'
import { useSite } from '@/site/site-context'
import { cn } from '@/shared/lib/utils'
import { MagicBento, MagicBentoCard } from '@/shared/motion/MagicBento'
import { buttonVariants } from '@/shared/ui/button'
import { ICON } from '@/shared/ui/icon'
import { eyebrow, lead } from '@/shared/ui/text'

const enter = 'motion-safe:animate-enter motion-reduce:animate-fade-in'

/**
 * The brand page of the Sino family (D-253): one sentence about Sino and one card per product that runs today.
 * The canvas has no such page, so it is built from canvas blocks; it names no product that does not exist yet.
 */
export function BrandPage() {
  const { appHref } = useSite()

  return (
    <>
      <section aria-label="Giới thiệu" className="flex flex-col items-start gap-6 pt-10 pb-12 md:pt-24 md:pb-16">
        <span className={cn(eyebrow, enter)}>SINO</span>
        <h1
          className={cn(
            'max-w-200 text-[38px] leading-11 font-bold tracking-[-0.04em] text-foreground md:text-[64px] md:leading-[70px]',
            enter,
          )}
        >
          Ứng dụng gọn cho việc mỗi ngày.
        </h1>
        <p className={cn(lead, enter, '[animation-delay:40ms]')}>
          Sino làm những ứng dụng nhỏ, làm đúng một việc và giữ dữ liệu của bạn riêng tư.
        </p>
      </section>

      <section aria-labelledby="h-san-pham" className={cn('flex flex-col gap-6', enter, '[animation-delay:80ms]')}>
        <h2 id="h-san-pham" className={eyebrow}>
          SẢN PHẨM
        </h2>
        <MagicBento>
          <MagicBentoCard
            data-slot="product"
            className="grid grid-cols-1 gap-8 p-7 md:col-span-12 md:p-10 lg:grid-cols-2 lg:items-center"
          >
            <div className="flex flex-col items-start gap-5">
              <FeatureIcon icon={Inbox} />
              <div className="flex flex-col gap-2">
                <h3 className="text-[28px] leading-9 font-bold tracking-[-0.02em]">Sino Messages</h3>
                <p className="max-w-120 text-base leading-[26px] text-muted-foreground">
                  Gom các tài khoản Gmail của bạn vào một hộp thư chung. Đọc, trả lời và ghi việc cần làm ở cùng một chỗ.
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-3 max-md:*:grow">
                <a className={buttonVariants()} href="/messages">
                  Xem Sino Messages
                  <ChevronRight {...ICON} />
                </a>
                <a className={buttonVariants({ variant: 'secondary' })} href={appHref('/')}>
                  Mở ứng dụng
                </a>
              </div>
            </div>
            <div aria-hidden="true" className="flex flex-col gap-1 rounded-[16px] border border-border bg-raised p-2">
              <MailRow
                className="p-3"
                mail={{
                  sender: 'Trần Minh Anh',
                  subject: 'Hợp đồng thuê văn phòng — bản sửa lần 2',
                  preview: 'Anh xem giúp và phản hồi trước thứ Tư nhé.',
                  time: '09:41',
                  unread: true,
                }}
              />
              <MailRow
                className="p-3"
                mail={{
                  sender: 'Phòng khám Ánh Dương',
                  subject: 'Lịch khám thứ Hai 05/10',
                  preview: 'Quý khách có lịch khám lúc 08:30.',
                  time: '08:15',
                  count: 2,
                }}
              />
            </div>
          </MagicBentoCard>
        </MagicBento>
      </section>
    </>
  )
}
