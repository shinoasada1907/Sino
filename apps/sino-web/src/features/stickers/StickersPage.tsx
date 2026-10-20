import { useCallback, useState } from 'react'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'
import { cn } from '@/shared/lib/utils'
import { Spec } from '@/shared/ui/spec'
import { GRID, StickerCard } from './StickerCard'
import { StickersEmpty, StickersLoadFailed, StickersSkeleton } from './StickerStates'
import { DeleteStickerDialog } from './DeleteStickerDialog'
import { DropZone } from './DropZone'
import { groupByPack } from './groupByPack'
import { DeletePackDialog, PackNameDialog } from './PackDialogs'
import { CreatePackButton, EmptyPack, PackButtons, PackSection } from './PackSection'
import { FilePicker, UploadButton } from './UploadButton'
import { UploadList } from './UploadList'
import type { StickerItem, StickerPack } from './stickers.types'
import { usePacks } from './usePacks'
import { useStickers } from './useStickers'
import { useUploadQueue } from './useUploadQueue'

/**
 * The Sticker screen (custom-stickers and sticker-packs, spec web-sticker-library): the library of the owner as a grid in
 * parts, one per pack and "Chưa xếp bộ" last (SP-06), with "Tạo bộ" and "Tải lên". The canvas has no frame for it (DN-7),
 * so it follows Ghi chú: a title with the count, and on a phone (like `MobileNotes`) the header with a way back to Thêm.
 * Loading, empty and failed lists each say so; the screen needs both the stickers and the packs.
 */
/** The sticker the owner is asking to delete, the button that asked, and the sticker the focus goes to if that one is gone. */
interface Deletion {
  sticker: StickerItem
  opener: HTMLElement
  neighborId: string | null
  open: boolean
}

/**
 * The dialog of a pack that is open or closing: its name (a new pack when `pack` is null) or its delete, the button that
 * opened it, and for a delete the pack whose delete button takes the focus if this one is gone. `seq` makes a new dialog
 * each time one opens, so the field of a name starts afresh.
 */
type PackDialog =
  | { kind: 'name'; pack: StickerPack | null; opener: HTMLElement; open: boolean; seq: number }
  | { kind: 'delete'; pack: StickerPack; count: number; opener: HTMLElement; neighborId: string | null; open: boolean; seq: number }

/** A dialog as the screen asks for it; `Omit` of each member, since an `Omit` of the union would keep only their common keys. */
type PackDialogRequest = PackDialog extends infer Member ? (Member extends PackDialog ? Omit<Member, 'open' | 'seq'> : never) : never

/** Of the buttons that match, the one CSS shows (the phone's or the wide screen's); the first where that cannot be told. */
function visibleOf(selector: string): HTMLElement | undefined {
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector))
  return all.find((element) => typeof element.checkVisibility !== 'function' || element.checkVisibility()) ?? all[0]
}

export function StickersPage() {
  const { stickers, error: stickersError, retry: retryStickers } = useStickers()
  const { packs, error: packsError, retry: retryPacks } = usePacks()
  const uploads = useUploadQueue()
  const [deletion, setDeletion] = useState<Deletion | null>(null)
  const [packDialog, setPackDialog] = useState<PackDialog | null>(null)
  // The sticker that has just moved, and the pack it moved to: its new cell takes the focus on its move button.
  const [moved, setMoved] = useState<{ id: string; packId: string | null } | null>(null)
  const clearMoved = useCallback(() => setMoved(null), [])
  const count = stickers?.length

  const parts = stickers && packs ? groupByPack(stickers, packs) : undefined
  // The stickers in the order the screen shows them, for the neighbour of one that is deleted.
  const shown = parts?.flatMap((part) => part.stickers) ?? []
  const failed = (stickers === undefined && stickersError) || (packs === undefined && packsError)

  const retry = () => {
    if (stickers === undefined) {
      retryStickers()
    }
    if (packs === undefined) {
      retryPacks()
    }
  }

  const askToDelete = (sticker: StickerItem, opener: HTMLElement) => {
    const at = shown.findIndex((item) => item.id === sticker.id)
    const neighbor = shown[at + 1] ?? shown[at - 1]
    setDeletion({ sticker, opener, neighborId: neighbor?.id ?? null, open: true })
  }

  // When the dialog has closed the focus goes back to the button that opened it. If that sticker is gone, to the delete
  // button of the next one (the previous if it was the last), and with none left, to the upload button of the empty library,
  // or to "Tạo bộ" when packs are left (the library is not empty then).
  const placeFocus = (event: Event) => {
    event.preventDefault()
    if (!deletion) {
      return
    }
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-sticker-delete]'))
    const target = deletion.opener.isConnected
      ? deletion.opener
      : (buttons.find((button) => button.dataset.stickerDelete === deletion.neighborId) ??
        document.querySelector<HTMLElement>('[data-slot="stickers-empty"] button') ??
        visibleOf('[data-pack-create]'))
    target?.focus()
  }

  const openPackDialog = (dialog: PackDialogRequest) => setPackDialog((current) => ({ ...dialog, open: true, seq: (current?.seq ?? 0) + 1 }))
  const closePackDialog = () => setPackDialog((current) => current && { ...current, open: false })

  const askToDeletePack = (pack: StickerPack, opener: HTMLElement) => {
    const at = packs?.findIndex((item) => item.id === pack.id) ?? -1
    const neighbor = packs?.[at + 1] ?? packs?.[at - 1]
    const held = parts?.find((part) => part.pack?.id === pack.id)?.stickers.length ?? 0
    openPackDialog({ kind: 'delete', pack, count: held, opener, neighborId: neighbor?.id ?? null })
  }

  // As for a sticker: back to the button that opened the dialog; if its pack is gone, to the delete button of the next pack
  // (the previous if it was the last), and with no pack left, or after a rename of a pack gone meanwhile, to "Tạo bộ".
  const placePackFocus = (event: Event) => {
    event.preventDefault()
    if (!packDialog) {
      return
    }
    const neighbor =
      packDialog.kind === 'delete'
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-pack-delete]')).find((button) => button.dataset.packDelete === packDialog.neighborId)
        : undefined
    const target = packDialog.opener.isConnected ? packDialog.opener : (neighbor ?? visibleOf('[data-pack-create]'))
    target?.focus()
  }

  const createPack = (opener: HTMLElement) => openPackDialog({ kind: 'name', pack: null, opener })

  return (
    <FilePicker onFiles={uploads.add}>
      {(openPicker) => (
        <DropZone label="Thư viện sticker" onFiles={uploads.add}>
          <MobilePageHeader
            back={{ to: '/more', label: 'Quay lại Thêm' }}
            title="Sticker"
            subtitle={count === undefined ? undefined : `${count} sticker`}
            action={
              <>
                <CreatePackButton iconOnly onClick={createPack} />
                <UploadButton iconOnly onClick={openPicker} />
              </>
            }
          />
          <header className="flex items-center justify-between gap-3 px-6 pt-6 max-md:hidden">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl leading-7 font-semibold tracking-[-0.01em]">Sticker</h1>
              {count !== undefined && <Spec>{count} sticker</Spec>}
            </div>
            <div className="flex items-center gap-2">
              <CreatePackButton onClick={createPack} />
              <UploadButton onClick={openPicker} />
            </div>
          </header>
          <UploadList entries={uploads.entries} active={uploads.active} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
          {parts === undefined ? (
            failed ? (
              <StickersLoadFailed onRetry={retry} />
            ) : (
              <StickersSkeleton />
            )
          ) : parts.length === 0 ? (
            <StickersEmpty>
              <UploadButton variant="secondary" onClick={openPicker} />
            </StickersEmpty>
          ) : (
            <div className="flex flex-col pb-4 md:pb-6">
              {parts.map(({ pack, stickers: held }) => (
                <PackSection
                  key={pack?.id ?? 'no-pack'}
                  name={pack?.name ?? 'Chưa xếp bộ'}
                  count={held.length}
                  actions={pack && <PackButtons pack={pack} onRename={(item, opener) => openPackDialog({ kind: 'name', pack: item, opener })} onDelete={askToDeletePack} />}
                >
                  {held.length === 0 ? (
                    <EmptyPack />
                  ) : (
                    // `role="list"`: Safari drops the list semantics of a list with `list-style: none`.
                    <ul role="list" aria-label={pack ? `Sticker trong bộ ${pack.name}` : 'Sticker chưa xếp bộ'} className={cn(GRID, 'pt-2 pb-2 md:pt-2 md:pb-2')}>
                      {held.map((sticker) => (
                        <StickerCard
                          key={sticker.id}
                          sticker={sticker}
                          packs={packs ?? []}
                          onDelete={askToDelete}
                          onMoved={(item) => setMoved({ id: item.id, packId: item.packId })}
                          focusMove={moved?.id === sticker.id && moved.packId === sticker.packId}
                          onMoveFocused={clearMoved}
                        />
                      ))}
                    </ul>
                  )}
                </PackSection>
              ))}
            </div>
          )}
          <DeleteStickerDialog
            sticker={deletion?.sticker ?? null}
            open={deletion?.open ?? false}
            onClose={() => setDeletion((current) => current && { ...current, open: false })}
            onCloseAutoFocus={placeFocus}
          />
          {packDialog?.kind === 'name' && (
            <PackNameDialog key={packDialog.seq} pack={packDialog.pack} open={packDialog.open} onClose={closePackDialog} onCloseAutoFocus={placePackFocus} />
          )}
          {packDialog?.kind === 'delete' && (
            <DeletePackDialog
              key={packDialog.seq}
              pack={packDialog.pack}
              count={packDialog.count}
              open={packDialog.open}
              onClose={closePackDialog}
              onCloseAutoFocus={placePackFocus}
            />
          )}
        </DropZone>
      )}
    </FilePicker>
  )
}
