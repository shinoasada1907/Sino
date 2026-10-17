// Copied from apps/sino-site/src/pages/messages/Band.tsx (web-public-pages, D-312); change both together.
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'
import { BorderGlow } from '../motion/BorderGlow'
import { heading2, ICON, lead } from '../ui'

/** Canvas `lp-band`: the last call to open Sino (sino-site D-246), to /overview and /login of this app (D-311). */
export function Band() {
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
          <Button asChild className="w-full">
            <Link to="/overview">
              Mở Sino Messages
              <ChevronRight {...ICON} />
            </Link>
          </Button>
        </BorderGlow>
        <Button asChild variant="secondary">
          <Link to="/login">Đăng nhập</Link>
        </Button>
      </div>
    </section>
  )
}
