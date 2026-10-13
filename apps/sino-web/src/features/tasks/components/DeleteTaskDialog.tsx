import { Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import type { TaskItem } from '../tasks.types'
import { useDeleteTask } from '../useTasks'

/**
 * "Xóa việc này?", opened by `trigger` ("Xóa task"). Confirming deletes the task and goes to `after` (the list with its
 * filter) in place of the detail, so Back does not open a task that is gone; "Hủy", the close button and Esc change
 * nothing. A refusal is said in the dialog, which stays open.
 */
export function DeleteTaskDialog({ task, after, trigger }: { task: TaskItem; after: string; trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const deletion = useDeleteTask()
  const navigate = useNavigate()

  const confirm = () =>
    deletion.mutate(task, {
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
          <DialogTitle>Xóa việc này?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>“{task.title}” sẽ bị xóa.</DialogDescription>
          {deletion.isError && (
            <p role="alert" className="text-sm text-danger-ink">
              Không xóa được việc. Hãy thử lại.
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
