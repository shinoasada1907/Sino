import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'
import { SinoMark } from '@/shared/ui/sino-mark'

/** 404 for a path outside the route table: the core of the canvas `SiteNotFound` (no public site exists yet). */
export function NotFoundPage() {
  return (
    <main className="min-h-svh bg-background bg-dots">
      <div className="mx-auto flex max-w-160 flex-col items-start gap-5 px-6 pt-16 pb-10 md:pt-30">
        <span className="inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.03em] text-foreground">
          <SinoMark className="size-5" />
          Sino
        </span>
        <span className="font-mono text-[96px] leading-none font-medium tracking-[-0.06em] md:text-[120px]">404</span>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] md:text-[40px] md:leading-12">
          Không tìm thấy trang này.
        </h1>
        <p className="text-base text-muted-foreground">Đường dẫn có thể đã đổi hoặc bị gõ nhầm.</p>
        <Button asChild>
          <Link to="/overview">Về Tổng quan</Link>
        </Button>
      </div>
    </main>
  )
}
