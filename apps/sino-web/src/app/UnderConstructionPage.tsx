import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

/** Placeholder for a screen of the navigation that is not built yet (D-42: one screen per change). */
export function UnderConstructionPage({ title }: { title: string }) {
  return (
    <section className="flex max-w-160 flex-col items-start gap-4 px-4 py-8 md:p-8">
      <span className="font-mono text-xs leading-4 font-medium tracking-[0.02em] text-muted-foreground">ĐANG DỰNG</span>
      <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Màn {title} đang được dựng</h1>
      <p className="text-sm text-muted-foreground">
        Giao diện của màn này sẽ được dựng theo canvas "Sino UI" ở một bước sau. Trong lúc chờ, các màn khác vẫn mở được từ
        thanh điều hướng.
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link to="/overview">Về Tổng quan</Link>
      </Button>
    </section>
  )
}
