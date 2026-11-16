import { Trash2 } from 'lucide-react'
import { ApiError } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import type { StickerItem } from './stickers.types'
import { useDeleteSticker } from './useStickers'

/**
 * "Xóa sticker này?", one for the whole screen: `sticker` is the one asked about and `open` whether the dialog shows (the
 * sticker stays through the closing, so its name does not vanish mid-animation). Confirming deletes it and closes; "Hủy", the
 * close button and Esc change nothing; a failure is said inside the dialog and the sticker stays. One the server no longer
 * has (deleted in another tab) counts as deleted. The dialog does not belong to a card, because the card is gone once the
 * sticker is: the screen decides where the focus goes (`onCloseAutoFocus`).
 */
export function DeleteStickerDialog({
  sticker,
  open,
  onClose,
  onCloseAutoFocus,
}: {
  sticker: StickerItem | null
  open: boolean
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const deletion = useDeleteSticker()

  const confirm = () => {
    if (!sticker) {
      return
    }
    deletion.mutate(sticker.id, {
      onSuccess: onClose,
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'STICKER_NOT_FOUND') {
          onClose()
        }
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          deletion.reset()
          onClose()
        }
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Xóa sticker này?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>“{sticker?.name}” sẽ bị xóa khỏi thư viện.</DialogDescription>
          {deletion.isError && !(deletion.error instanceof ApiError && deletion.error.code === 'STICKER_NOT_FOUND') && (
            <p role="alert" className="text-sm text-danger-ink">
              Không xóa được sticker. Hãy thử lại.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Hủy
            </Button>
          </DialogClose>
          <Button type="button" variant="danger" disabled={deletion.isPending} onClick={confirm}>
            <Trash2 strokeWidth={1.6} />
            Xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
