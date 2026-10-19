import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Spec } from '@/shared/ui/spec'
import { GRID, StickerCard } from './StickerCard'
import { StickersEmpty, StickersLoadFailed, StickersSkeleton } from './StickerStates'
import { useStickers } from './useStickers'

/**
 * The Sticker screen (custom-stickers, spec web-sticker-library): the library of the owner as a grid, newest first. The
 * canvas has no frame for it yet (`tasks.md` 0.1), so it follows Ghi chú: a title with the count, and on a phone
 * (like `MobileNotes`) the header with a way back to Thêm. Loading, empty and failed lists each say so.
 */
export function StickersPage() {
  const { stickers, error, retry } = useStickers()
  const count = stickers?.length

  return (
    <section aria-label="Thư viện sticker" className="flex h-full min-h-0 flex-col overflow-auto">
      <MobilePageHeader back={{ to: '/more', label: 'Quay lại Thêm' }} title="Sticker" subtitle={count === undefined ? undefined : `${count} sticker`} />
      <header className="flex items-baseline gap-3 px-6 pt-6 max-md:hidden">
        <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Sticker</h1>
        {count !== undefined && <Spec>{count} sticker</Spec>}
      </header>
      {stickers === undefined ? (
        error ? (
          <StickersLoadFailed onRetry={retry} />
        ) : (
          <StickersSkeleton />
        )
      ) : stickers.length === 0 ? (
        <StickersEmpty />
      ) : (
        // `role="list"`: Safari drops the list semantics of a list with `list-style: none`.
        <ul role="list" aria-label="Sticker của bạn" className={GRID}>
          {stickers.map((sticker) => (
            <StickerCard key={sticker.id} sticker={sticker} />
          ))}
        </ul>
      )}
    </section>
  )
}
