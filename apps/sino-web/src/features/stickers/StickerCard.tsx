import { Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { stickerContentUrl } from './stickers.api'
import type { StickerItem } from './stickers.types'

/** The grid of the library and of its skeleton: as many square cells as fit, none narrower than 140 px (the same on every size). */
export const GRID = 'grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-4 md:gap-4 md:p-6'

/**
 * One sticker of the library: its picture (a GIF plays by itself, DN-4), its name and its size, and a button to delete it.
 * The picture loads lazily, since the library can hold three hundred, and is named by the sticker for a screen reader.
 * The delete button shows on hover where there is one, and always where there is none (touch) or when it has the focus;
 * it hands over the sticker and itself, so the screen can give the focus back to it.
 */
export function StickerCard({ sticker, onDelete }: { sticker: StickerItem; onDelete: (sticker: StickerItem, opener: HTMLElement) => void }) {
  return (
    <li className="group flex min-w-0 flex-col gap-2 rounded-xl border bg-surface p-2.5">
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-raised">
        <img src={stickerContentUrl(sticker.id)} alt={sticker.name} loading="lazy" width={sticker.width} height={sticker.height} className="size-full object-contain" />
        {sticker.kind === 'ANIMATED' && (
          <span className="absolute top-1.5 left-1.5 rounded-xs border bg-surface px-1.5 font-mono text-[10px] leading-4 font-medium text-muted-foreground">Động</span>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={`Xóa ${sticker.name}`}
          data-sticker-delete={sticker.id}
          onClick={(event) => onDelete(sticker, event.currentTarget)}
          className="absolute top-1.5 right-1.5 max-md:size-11 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <Trash2 strokeWidth={1.6} />
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-semibold" title={sticker.name}>
          {sticker.name}
        </span>
        <Spec>
          {sticker.width} × {sticker.height}
        </Spec>
      </div>
    </li>
  )
}
