import { ChevronRight } from 'lucide-react'
import { useSite } from '@/site/site-context'
import { BorderGlow } from '@/shared/motion/BorderGlow'
import { buttonVariants } from '@/shared/ui/button'
import { ICON } from '@/shared/ui/icon'
import { heading2, lead } from '@/shared/ui/text'

/** Canvas `lp-band`: the last call to open Sino (D-246). */
export function Band() {
  const { appHref } = useSite()

  return (
    <section
      aria-label="Bắt đầu"
      className="mt-20 grid grid-cols-1 items-center gap-8 rounded-[28px] border border-border-strong bg-raised px-6 py-8 md:mt-30 md:p-16 lg:grid-cols-[minmax(0,1fr)_auto] [background-image:radial-gradient(var(--grid-dot)_1.2px,transparent_1.7px),radial-gradient(640px_circle_at_0%_0%,var(--spot-strong),transparent_60%)] [background-size:20px_20px,auto]"
    >
      <div className="flex flex-col gap-3">
        <h2 className={heading2}>Bớt mở từng hộp thư. Bớt quên việc.</h2>
        <p className={lead}>Kết nối tài khoản Gmail đầu tiên và xem hộp thư chung của bạn sau vài phút.</p>
      </div>
      <div data-slot="cta" className="flex flex-wrap gap-3 max-md:*:grow">
        <BorderGlow>
          <a className={buttonVariants({ className: 'w-full' })} href={appHref('/')}>
            Mở Sino Messages
            <ChevronRight {...ICON} />
          </a>
        </BorderGlow>
        <a className={buttonVariants({ variant: 'secondary' })} href={appHref('/login')}>
          Đăng nhập
        </a>
      </div>
    </section>
  )
}
