import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import type { StickerPack } from '../stickers.types'
import { BatchList, type BatchFocus } from './BatchList'
import { BatchRefusals } from './BatchRefusals'
import { ImageEditor } from './ImageEditor'
import { PackPicker } from './PackPicker'
import { NO_PACK, type Batch } from './useBatch'
import { useSaveBatch, type SavedBatch } from './useSaveBatch'

const carriesFiles = (event: DragEvent | globalThis.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * The "Thêm sticker" step (SP-08, spec sticker-upload-editor): the pictures chosen or dropped, the selected one shown
 * large in its own editor (SP-09), pictures added or taken out, and nothing sent before "Lưu". A dialog from 768 px;
 * below that it fills the screen as a page of its own, still a dialog, so the focus stays in it and goes back to the
 * button that opened it.
 *
 * "Lưu N sticker" saves the batch into the pack it shows (`useSaveBatch`, SP-10): each picture says where it stands, a
 * failed one stays with why, and the step closes once all are saved. Closing it with pictures not saved asks first.
 */
export function AddStickers({
  batch,
  packs,
  onAddMore,
  onSaved,
  onCloseAutoFocus,
}: {
  batch: Batch
  packs: StickerPack[]
  onAddMore: () => void
  onSaved: (saved: SavedBatch) => void
  /** Where the focus goes once the step has closed; the screen knows which button opened it. */
  onCloseAutoFocus: (event: Event) => void
}) {
  const saver = useSaveBatch(batch, packs, onSaved)
  const [focus, setFocus] = useState<BatchFocus>(null)
  const [asking, setAsking] = useState(false)
  const clearFocus = useCallback(() => setFocus(null), [])
  const count = batch.items.length
  // A pack deleted meanwhile (in another tab) is no longer among the packs: the batch shows, and goes into, none.
  const { pack } = batch
  const choice = pack.kind === 'existing' && !packs.some((item) => item.id === pack.id) ? NO_PACK : pack

  // A drop outside the step (on its backdrop) must not open the file in the tab and lose the batch.
  useEffect(() => {
    if (!batch.open) {
      return
    }
    const keep = (event: globalThis.DragEvent) => {
      if (carriesFiles(event)) {
        event.preventDefault()
      }
    }
    window.addEventListener('dragover', keep)
    window.addEventListener('drop', keep)
    return () => {
      window.removeEventListener('dragover', keep)
      window.removeEventListener('drop', keep)
    }
  }, [batch.open])

  const remove = (id: number) => {
    const at = batch.items.findIndex((item) => item.id === id)
    const neighbour = batch.items[at + 1] ?? batch.items[at - 1]
    batch.remove(id)
    setFocus(neighbour ? { removeOf: neighbour.id } : 'add')
  }

  // "Hủy", the close button and Esc: with pictures left, the owner is asked first; nothing is closed during a save.
  const askToClose = () => {
    if (saver.saving) {
      return
    }
    if (count > 0) {
      setAsking(true)
    } else {
      close()
    }
  }

  const close = () => {
    saver.reset()
    batch.close()
  }

  return (
    <>
      <Dialog
        open={batch.open}
        onOpenChange={(next) => {
          if (!next) {
            askToClose()
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={onCloseAutoFocus}
          className="max-h-[calc(100svh-2rem)] md:max-w-200 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0"
          onDragOver={(event) => {
            if (carriesFiles(event)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => {
            if (carriesFiles(event)) {
              event.preventDefault()
              // The step is in a portal, but React events still rise through the components above it.
              event.stopPropagation()
              void batch.add(Array.from(event.dataTransfer.files))
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Thêm sticker</DialogTitle>
            <DialogDescription>Ảnh tĩnh được cắt và thu nhỏ khi lưu; ảnh động được lưu nguyên.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-5 pb-6 max-md:px-4">
            <PackPicker
              packs={packs}
              value={choice}
              error={saver.packError}
              disabled={saver.saving}
              onChange={(next) => {
                saver.clearPackError()
                batch.setPack(next)
              }}
            />
            <div className="flex min-h-0 flex-col gap-4 md:flex-row">
              <BatchList
                items={batch.items}
                selectedId={batch.selectedId}
                disabled={saver.saving}
                onSelect={batch.select}
                onRemove={remove}
                onAdd={onAddMore}
                focus={focus}
                onFocused={clearFocus}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                {batch.selected ? (
                  <ImageEditor
                    key={batch.selected.id}
                    item={batch.selected}
                    onEdit={(change) => batch.selected && batch.edit(batch.selected.id, change)}
                    onRename={(name) => batch.selected && batch.rename(batch.selected.id, name)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có ảnh nào trong lượt. Thêm ảnh để tiếp tục.</p>
                )}
                {batch.refusals.length > 0 && <BatchRefusals refusals={batch.refusals} />}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            <p role="status" className="mr-auto text-sm text-muted-foreground">
              {saver.progress}
            </p>
            <Button type="button" variant="secondary" disabled={saver.saving} onClick={askToClose}>
              Hủy
            </Button>
            <Button type="button" disabled={count === 0 || saver.saving} onClick={() => void saver.save(choice)}>
              Lưu {count} sticker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent role="alertdialog">
          <DialogHeader>
            <DialogTitle>Bỏ {count} ảnh chưa lưu?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>Các ảnh này chưa được lưu, và phần chỉnh của chúng sẽ mất.</DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Tiếp tục chỉnh
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setAsking(false)
                close()
              }}
            >
              Bỏ ảnh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
