import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { isPackName, PACK_NAME_RULE, packErrorMessage } from './format'
import type { StickerPack } from './stickers.types'
import { useCreatePack, useDeletePack, useRenamePack } from './usePacks'

// The dialogs of the packs (SP-06), one of each for the whole screen, like the delete of a sticker (ST-15): the screen
// says which pack, whether the dialog shows (the pack stays through the closing, so its name does not vanish mid-animation),
// and where the focus goes once it has closed (`onCloseAutoFocus`). "Hủy", the close button and Esc change nothing.

interface DialogProps {
  open: boolean
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
}

/**
 * "Tạo bộ sticker" (`pack` null) or "Đổi tên bộ": a name, checked here by the rule of the server before it is sent, and
 * every refusal of the server said under the field in Vietnamese. The screen mounts a new one each time it opens, so the
 * field starts from the name of the pack, or empty.
 */
export function PackNameDialog({ pack, open, onClose, onCloseAutoFocus }: DialogProps & { pack: StickerPack | null }) {
  const field = useId()
  const [name, setName] = useState(pack?.name ?? '')
  const [tried, setTried] = useState(false)
  const create = useCreatePack()
  const rename = useRenamePack()
  const saving = pack ? rename : create

  const ruleBroken = tried && !isPackName(name)
  const error = ruleBroken ? PACK_NAME_RULE : saving.isError ? packErrorMessage(saving.error, name) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (!isPackName(name) || saving.isPending) {
      return
    }
    if (pack) {
      rename.mutate({ id: pack.id, name }, { onSuccess: onClose })
    } else {
      create.mutate(name, { onSuccess: onClose })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{pack ? 'Đổi tên bộ' : 'Tạo bộ sticker'}</DialogTitle>
          <DialogDescription>{pack ? 'Sticker của bộ vẫn ở trong bộ.' : 'Đặt tên cho bộ, như “Mèo” hay “Chúc mừng”. Sau đó thêm sticker vào bộ.'}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit}>
          <DialogBody>
            <div className="flex flex-col gap-2">
              <Label htmlFor={field}>Tên bộ</Label>
              <Input
                id={field}
                value={name}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value)
                  saving.reset()
                }}
                {...(error ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {})}
              />
              {error && (
                <p id={`${field}-error`} role="alert" className="text-sm text-danger-ink">
                  {error}
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Hủy
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving.isPending}>
              {pack ? 'Lưu' : 'Tạo bộ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Xóa bộ …?": says what becomes of its `count` stickers (they go to "Chưa xếp bộ", DN-1). A failure is said inside the
 * dialog and the pack stays; one the server no longer has (deleted in another tab) counts as deleted.
 */
export function DeletePackDialog({ pack, count, open, onClose, onCloseAutoFocus }: DialogProps & { pack: StickerPack | null; count: number }) {
  const deletion = useDeletePack()
  const gone = (error: Error) => error instanceof ApiError && error.code === 'STICKER_PACK_NOT_FOUND'

  const confirm = () => {
    if (!pack) {
      return
    }
    deletion.mutate(pack.id, {
      onSuccess: onClose,
      onError: (error) => {
        if (gone(error)) {
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
          <DialogTitle>Xóa bộ “{pack?.name}”?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{count > 0 ? `${count} sticker của bộ sẽ về “Chưa xếp bộ”; không sticker nào bị xóa.` : 'Bộ đang trống.'}</DialogDescription>
          {deletion.isError && !gone(deletion.error) && (
            <p role="alert" className="text-sm text-danger-ink">
              Không xóa được bộ. Hãy thử lại.
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
            Xóa bộ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
