import { TriangleAlert } from 'lucide-react'
import { Button } from '@/shared/ui/button'

/** The account list could not load (the API failed or did not answer): say so, and offer to try again. */
export function ListUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex max-w-105 flex-col items-start gap-4 px-4 py-8 md:px-8">
      <TriangleAlert className="size-6 text-danger" strokeWidth={1.6} />
      <div className="flex flex-col gap-1">
        <h2 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Không tải được danh sách tài khoản</h2>
        <p className="text-sm text-muted-foreground">Máy chủ Sino không phản hồi. Thử lại sau ít phút.</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  )
}
