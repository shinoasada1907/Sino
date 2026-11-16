import { FolderPlus, ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import type { StickerPack } from './stickers.types'

/**
 * One part of the Sticker screen (SP-06, DN-7: no canvas frame, built from the parts of the screen): the name of a pack, or
 * "Chưa xếp bộ", how many stickers it holds, its buttons, and its grid (`children`). It is a region named by its heading,
 * so a screen reader can jump from pack to pack.
 */
export function PackSection({ name, count, actions, children }: { name: string; count: number; actions?: ReactNode; children: ReactNode }) {
  const heading = useId()
  return (
    <section aria-labelledby={heading} className="flex flex-col">
      <div className="flex min-h-11 items-center gap-2 px-4 pt-4 md:px-6 md:pt-6">
        <h2 id={heading} className="min-w-0 truncate text-base leading-6 font-semibold" title={name}>
          {name}
        </h2>
        <Spec className="shrink-0">{count} sticker</Spec>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** What an empty pack shows in place of its grid. */
export function EmptyPack() {
  return <p className="px-4 pt-2 pb-2 text-sm text-muted-foreground md:px-6">Bộ này đang trống.</p>
}

/**
 * "Thêm ảnh", "Đổi tên" and "Xóa" of a pack, as icons named after it. "Thêm ảnh" opens the picker and starts the batch on
 * this pack (D-348). Each hands over the pack and itself, so the screen can give the focus back to it when the dialog
 * closes (`data-pack-delete` finds the one of the next part after a delete).
 */
export function PackButtons({
  pack,
  onAddTo,
  onRename,
  onDelete,
}: {
  pack: StickerPack
  onAddTo: (pack: StickerPack, opener: HTMLElement) => void
  onRename: (pack: StickerPack, opener: HTMLElement) => void
  onDelete: (pack: StickerPack, opener: HTMLElement) => void
}) {
  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Thêm ảnh vào bộ ${pack.name}`} onClick={(event) => onAddTo(pack, event.currentTarget)} className="max-md:size-11">
        <ImagePlus strokeWidth={1.6} />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Đổi tên bộ ${pack.name}`} onClick={(event) => onRename(pack, event.currentTarget)} className="max-md:size-11">
        <Pencil strokeWidth={1.6} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Xóa bộ ${pack.name}`}
        data-pack-delete={pack.id}
        onClick={(event) => onDelete(pack, event.currentTarget)}
        className="max-md:size-11"
      >
        <Trash2 strokeWidth={1.6} />
      </Button>
    </>
  )
}

/** "Tạo bộ": the button with its icon and word, or (`iconOnly`, for the phone header) the icon with the word as its name. */
export function CreatePackButton({ onClick, iconOnly = false }: { onClick: (opener: HTMLElement) => void; iconOnly?: boolean }) {
  return iconOnly ? (
    <Button type="button" variant="ghost" size="icon" aria-label="Tạo bộ" data-pack-create="" onClick={(event) => onClick(event.currentTarget)}>
      <FolderPlus strokeWidth={1.6} />
    </Button>
  ) : (
    <Button type="button" variant="secondary" size="sm" data-pack-create="" onClick={(event) => onClick(event.currentTarget)}>
      <FolderPlus strokeWidth={1.6} />
      Tạo bộ
    </Button>
  )
}
