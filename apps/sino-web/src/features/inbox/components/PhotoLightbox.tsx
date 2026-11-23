import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { copyImageToClipboard } from '../clipboard'

export interface LightboxPhoto {
  src: string
  caption?: string | null
  sender?: string
  alt?: string
}

/**
 * Floating modal lightbox for viewing conversation photos without leaving the chat tab.
 * Supports keyboard navigation (ArrowLeft / ArrowRight / Escape), zoom toggle, copy, and opening in a new tab.
 */
export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: LightboxPhoto[]
  index: number | null
  onClose: () => void
  onIndexChange?: (next: number) => void
}) {
  const open = index !== null && index >= 0 && index < photos.length
  const photo = open ? photos[index] : null
  const hasPrev = open && index > 0
  const hasNext = open && index < photos.length - 1

  const goPrev = () => {
    if (hasPrev && onIndexChange && index !== null) {
      onIndexChange(index - 1)
    }
  }

  const goNext = () => {
    if (hasNext && onIndexChange && index !== null) {
      onIndexChange(index + 1)
    }
  }

  useEffect(() => {
    if (!open || photos.length <= 1 || !onIndexChange || index === null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        onIndexChange(index - 1)
      } else if (event.key === 'ArrowRight' && index < photos.length - 1) {
        event.preventDefault()
        onIndexChange(index + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, index, photos.length, onIndexChange])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="photo-lightbox-overlay"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Content
          data-slot="photo-lightbox"
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[min(94vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface/95 text-foreground shadow-2xl duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {photo && (
            <LightboxBody
              key={photo.src}
              photo={photo}
              index={index!}
              total={photos.length}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={goPrev}
              onNext={goNext}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function LightboxBody({
  photo,
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  photo: LightboxPhoto
  index: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const [zoomed, setZoomed] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyImageToClipboard(photo.src)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <DialogPrimitive.Title className="truncate text-sm font-semibold text-foreground">
            {photo.sender ? `Ảnh từ ${photo.sender}` : 'Xem ảnh'}
          </DialogPrimitive.Title>
          {total > 1 && (
            <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
              {index + 1} / {total}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? 'Thu nhỏ ảnh' : 'Phóng to ảnh'}
            title={zoomed ? 'Thu nhỏ' : 'Phóng to'}
          >
            {zoomed ? <ZoomOut className="size-4" strokeWidth={1.7} /> : <ZoomIn className="size-4" strokeWidth={1.7} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-9 gap-1.5 px-2.5 text-xs font-medium"
            aria-label="Sao chép ảnh"
            title="Sao chép ảnh"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-500" strokeWidth={2} />
                <span className="text-emerald-500 font-semibold">Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" strokeWidth={1.7} />
                <span className="hidden sm:inline">Sao chép</span>
              </>
            )}
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            title="Mở trong tab mới"
          >
            <a
              href={photo.src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Mở trong tab mới"
            >
              <ExternalLink className="size-4" strokeWidth={1.7} />
            </a>
          </Button>
          <DialogPrimitive.Close asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" title="Đóng">
              <X className="size-4" strokeWidth={1.8} />
            </Button>
          </DialogPrimitive.Close>
        </div>
      </div>

      <div className="relative flex min-h-60 flex-1 items-center justify-center overflow-auto bg-background/80 p-3 sm:p-5">
        {total > 1 && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label="Ảnh trước"
            className="absolute top-1/2 left-3 z-10 -translate-y-1/2 shadow-md disabled:opacity-30"
          >
            <ChevronLeft className="size-4.5" strokeWidth={1.8} />
          </Button>
        )}

        <img
          src={photo.src}
          alt={photo.alt ?? photo.caption ?? 'Ảnh'}
          referrerPolicy="no-referrer"
          onClick={() => setZoomed((z) => !z)}
          className={cn(
            'select-none rounded-lg object-contain transition-transform duration-150',
            zoomed
              ? 'max-h-none max-w-none cursor-zoom-out'
              : 'max-h-[72vh] max-w-full cursor-zoom-in',
          )}
        />

        {total > 1 && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Ảnh tiếp theo"
            className="absolute top-1/2 right-3 z-10 -translate-y-1/2 shadow-md disabled:opacity-30"
          >
            <ChevronRight className="size-4.5" strokeWidth={1.8} />
          </Button>
        )}
      </div>

      {photo.caption && (
        <div className="border-t border-border/70 bg-surface px-4 py-2.5 text-center text-xs leading-relaxed text-muted-foreground">
          {photo.caption}
        </div>
      )}
    </>
  )
}
