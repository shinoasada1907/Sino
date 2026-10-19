import { RotateCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { STICKER_LIMIT_LABEL } from './format'
import { GRID } from './StickerCard'

/** The shape of the grid while the list loads (no canvas for this state; as the other screens). */
export function StickersSkeleton() {
  return (
    <div role="status" aria-label="Đang tải sticker" className={GRID}>
      <span className="sr-only">Đang tải sticker</span>
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} aria-hidden="true" className="aspect-[4/5] animate-pulse rounded-xl bg-hover" />
      ))}
    </div>
  )
}

/** "Không tải được sticker" with a way to try again. */
export function StickersLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4.5 px-4 py-10 md:px-6">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger"
      >
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được sticker</h2>
        <p className="text-sm text-muted-foreground">Sticker của bạn vẫn còn nguyên. Hãy thử lại.</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw strokeWidth={1.6} />
        Thử lại
      </Button>
    </div>
  )
}

/** "Thư viện sticker đang trống", with whatever tells the owner how to fill it (`children`). */
export function StickersEmpty({ children }: { children?: ReactNode }) {
  return (
    <div data-slot="stickers-empty" className="flex max-w-105 flex-col items-start gap-3 px-4 py-10 md:px-6">
      <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Thư viện sticker đang trống</h2>
      <p className="text-sm text-muted-foreground">Bấm “Tải lên” để chọn ảnh PNG, GIF hoặc WebP, mỗi ảnh tối đa {STICKER_LIMIT_LABEL}.</p>
      {children}
    </div>
  )
}
