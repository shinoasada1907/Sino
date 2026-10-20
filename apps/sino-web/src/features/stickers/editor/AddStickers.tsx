import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { PICTURE_UNREADABLE } from '../format'
import { BatchList, type BatchFocus } from './BatchList'
import { BatchRefusals } from './BatchRefusals'
import { fileToSend } from './fileToSend'
import type { Batch, BatchItem } from './useBatch'

const carriesFiles = (event: DragEvent | globalThis.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * The "Thêm sticker" step (SP-08, spec sticker-upload-editor): the pictures chosen or dropped, the selected one shown
 * large, pictures added or taken out, and nothing sent before "Lưu". A dialog from 768 px; below that it fills the screen
 * as a page of its own, still a dialog, so the focus stays in it and goes back to the button that opened it.
 *
 * "Lưu" hands the files to the upload queue of the screen (`onSend`): a moving picture as it is, a still one as the PNG
 * of its middle square. A picture the browser cannot read stays in the step, with why. Framing by hand is SP-09, the pack
 * of the batch and a state for each picture SP-10.
 */
export function AddStickers({
  batch,
  onAddMore,
  onSend,
  onCloseAutoFocus,
}: {
  batch: Batch
  onAddMore: () => void
  onSend: (files: File[]) => void
  /** Where the focus goes once the step has closed; the screen knows which button opened it. */
  onCloseAutoFocus: (event: Event) => void
}) {
  const [saving, setSaving] = useState(false)
  const [focus, setFocus] = useState<BatchFocus>(null)
  const clearFocus = useCallback(() => setFocus(null), [])
  const count = batch.items.length

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

  const save = async () => {
    const chosen = batch.items
    setSaving(true)
    const files: File[] = []
    const sent: number[] = []
    for (const item of chosen) {
      try {
        files.push(await fileToSend(item))
        sent.push(item.id)
      } catch {
        batch.setProblem(item.id, PICTURE_UNREADABLE)
      }
    }
    setSaving(false)
    if (files.length > 0) {
      onSend(files)
    }
    if (sent.length === chosen.length) {
      batch.close()
    } else {
      batch.take(sent)
    }
  }

  return (
    <Dialog
      open={batch.open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          batch.close()
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
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-5 pb-6 max-md:px-4 md:flex-row">
          <BatchList
            items={batch.items}
            selectedId={batch.selectedId}
            disabled={saving}
            onSelect={batch.select}
            onRemove={remove}
            onAdd={onAddMore}
            focus={focus}
            onFocused={clearFocus}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {batch.selected ? <Preview item={batch.selected} /> : <p className="text-sm text-muted-foreground">Chưa có ảnh nào trong lượt. Thêm ảnh để tiếp tục.</p>}
            {batch.refusals.length > 0 && <BatchRefusals refusals={batch.refusals} />}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={saving}>
              Hủy
            </Button>
          </DialogClose>
          <Button type="button" disabled={count === 0 || saving} onClick={() => void save()}>
            Lưu {count} sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The selected picture, large, with what "Lưu" will do with it, and why it failed the last time if it did. */
function Preview({ item }: { item: BatchItem }) {
  return (
    <figure className="flex min-h-0 flex-col gap-3">
      <div className="grid aspect-square max-h-[min(28rem,50svh)] w-full place-items-center overflow-hidden rounded-lg border bg-raised">
        <img src={item.previewUrl} alt={`Xem trước ${item.file.name}`} className="max-h-full max-w-full object-contain" />
      </div>
      <figcaption className="text-sm text-muted-foreground">
        {item.kind.editing === 'whole' ? 'Ảnh động được lưu nguyên: không cắt, không xoay.' : 'Ảnh sẽ được lưu là hình vuông lớn nhất ở giữa ảnh, cạnh tối đa 512 điểm ảnh.'}
      </figcaption>
      {item.problem && (
        <p role="alert" className="text-sm text-danger-ink">
          {item.problem}
        </p>
      )}
    </figure>
  )
}
