import { ChevronLeft } from 'lucide-react'
import { useSite } from '@/site/site-context'
import { buttonVariants } from '@/shared/ui/button'
import { heading2, lead } from '@/shared/ui/text'

/** Canvas `SiteNotFound`; static hosts answer unknown paths with 404.html. */
export function NotFoundPage() {
  const { appHref } = useSite()

  return (
    <section className="flex max-w-160 flex-col items-start gap-5 pt-18 pb-10 md:pt-30" aria-label="Không tìm thấy trang">
      <span className="font-mono text-[88px] leading-none font-medium tracking-[-0.06em] text-foreground md:text-[120px]">
        404
      </span>
      <h1 className={heading2}>Không tìm thấy trang này.</h1>
      <p className={lead}>Đường dẫn có thể đã đổi hoặc bị gõ nhầm. Thử về trang chủ hoặc mở thẳng Sino.</p>
      <div className="flex w-full flex-wrap gap-3 max-md:*:grow">
        <a className={buttonVariants()} href="/">
          <ChevronLeft strokeWidth={1.6} aria-hidden="true" />
          Về trang chủ
        </a>
        <a className={buttonVariants({ variant: 'secondary' })} href={appHref('/')}>
          Mở Sino Messages
        </a>
      </div>
    </section>
  )
}
