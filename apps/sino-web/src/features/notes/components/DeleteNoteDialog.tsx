import { Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { noteTitle } from '../format'
import type { NoteItem } from '../notes.types'
import { useDeleteNote } from '../useNotes'

/**
 * "Xóa ghi chú này?", opened by `trigger`. Confirming deletes the note and goes to `after` (the list with its filter) in
 * place of the note, so Back does not open a note that is gone; "Hủy", the close button and Esc change nothing.
 */
export function DeleteNoteDialog({ note, after, trigger }: { note: NoteItem; after: string; trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const deletion = useDeleteNote()
  const navigate = useNavigate()

  const confirm = () =>
    deletion.mutate(note, {
      onSuccess: () => {
        setOpen(false)
        navigate(after, { replace: true })
      },
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        deletion.reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa ghi chú này?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>“{noteTitle(note)}” sẽ bị xóa.</DialogDescription>
          {deletion.isError && (
            <p role="alert" className="text-sm text-danger-ink">
              Không xóa được ghi chú. Hãy thử lại.
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
