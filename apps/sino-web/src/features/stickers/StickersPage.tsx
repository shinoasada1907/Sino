import { useState } from 'react'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { Spec } from '@/shared/ui/spec'
import { GRID, StickerCard } from './StickerCard'
import { StickersEmpty, StickersLoadFailed, StickersSkeleton } from './StickerStates'
import { DeleteStickerDialog } from './DeleteStickerDialog'
import { DropZone } from './DropZone'
import { FilePicker, UploadButton } from './UploadButton'
import { UploadList } from './UploadList'
import type { StickerItem } from './stickers.types'
import { useStickers } from './useStickers'
import { useUploadQueue } from './useUploadQueue'

/**
 * The Sticker screen (custom-stickers, spec web-sticker-library): the library of the owner as a grid, newest first, with
 * "Tải lên" to add pictures. The canvas has no frame for it yet (`tasks.md` 0.1), so it follows Ghi chú: a title with the
 * count, and on a phone (like `MobileNotes`) the header with a way back to Thêm. Loading, empty and failed lists each say so.
 */
/** The sticker the owner is asking to delete, the button that asked, and the sticker the focus goes to if that one is gone. */
interface Deletion {
  sticker: StickerItem
  opener: HTMLElement
  neighborId: string | null
  open: boolean
}

export function StickersPage() {
  const { stickers, error, retry } = useStickers()
  const uploads = useUploadQueue()
  const [deletion, setDeletion] = useState<Deletion | null>(null)
  const count = stickers?.length

  const askToDelete = (sticker: StickerItem, opener: HTMLElement) => {
    const at = stickers?.findIndex((item) => item.id === sticker.id) ?? -1
    const neighbor = stickers?.[at + 1] ?? stickers?.[at - 1]
    setDeletion({ sticker, opener, neighborId: neighbor?.id ?? null, open: true })
  }

  // When the dialog has closed the focus goes back to the button that opened it. If that sticker is gone, to the delete
  // button of the next one (the previous if it was the last), and with none left, to the upload button of the empty library.
  const placeFocus = (event: Event) => {
    event.preventDefault()
    if (!deletion) {
      return
    }
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-sticker-delete]'))
    const target = deletion.opener.isConnected
      ? deletion.opener
      : (buttons.find((button) => button.dataset.stickerDelete === deletion.neighborId) ?? document.querySelector<HTMLElement>('[data-slot="stickers-empty"] button'))
    target?.focus()
  }

  return (
    <FilePicker onFiles={uploads.add}>
      {(openPicker) => (
        <DropZone label="Thư viện sticker" onFiles={uploads.add}>
          <MobilePageHeader
            back={{ to: '/more', label: 'Quay lại Thêm' }}
            title="Sticker"
            subtitle={count === undefined ? undefined : `${count} sticker`}
            action={<UploadButton iconOnly onClick={openPicker} />}
          />
          <header className="flex items-center justify-between gap-3 px-6 pt-6 max-md:hidden">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Sticker</h1>
              {count !== undefined && <Spec>{count} sticker</Spec>}
            </div>
            <UploadButton onClick={openPicker} />
          </header>
          <UploadList entries={uploads.entries} active={uploads.active} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
          {stickers === undefined ? (
            error ? (
              <StickersLoadFailed onRetry={retry} />
            ) : (
              <StickersSkeleton />
            )
          ) : stickers.length === 0 ? (
            <StickersEmpty>
              <UploadButton variant="secondary" onClick={openPicker} />
            </StickersEmpty>
          ) : (
            // `role="list"`: Safari drops the list semantics of a list with `list-style: none`.
            <ul role="list" aria-label="Sticker của bạn" className={GRID}>
              {stickers.map((sticker) => (
                <StickerCard key={sticker.id} sticker={sticker} onDelete={askToDelete} />
              ))}
            </ul>
          )}
          <DeleteStickerDialog
            sticker={deletion?.sticker ?? null}
            open={deletion?.open ?? false}
            onClose={() => setDeletion((current) => current && { ...current, open: false })}
            onCloseAutoFocus={placeFocus}
          />
        </DropZone>
      )}
    </FilePicker>
  )
}
