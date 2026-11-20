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
import type { CalendarEvent } from '../calendar.types'
import { useDeleteEvent } from '../useCalendar'

/**
 * "Xóa lịch hẹn này?" ("Xóa cả chuỗi lịch hẹn này?" when it repeats, D-151), opened by `trigger` ("Xóa lịch hẹn").
 * Confirming deletes the appointment through `/api/events/{eventId}` and replaces the detail with `after` (the calendar
 * with its view and day), so Back does not return to an appointment that is gone.
 */
export function DeleteEventDialog({ event, after, trigger }: { event: CalendarEvent; after: string; trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const deletion = useDeleteEvent()
  const navigate = useNavigate()
  const repeating = event.recurrence !== null

  const confirm = () =>
    deletion.mutate(event.eventId, {
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
          <DialogTitle>{repeating ? 'Xóa cả chuỗi lịch hẹn này?' : 'Xóa lịch hẹn này?'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {repeating ? `Mọi lần lặp của “${event.title}” sẽ bị xóa.` : `“${event.title}” sẽ bị xóa.`}
          </DialogDescription>
          {deletion.isError && (
            <p role="alert" className="text-sm text-danger-ink">
              Không xóa được lịch hẹn. Hãy thử lại.
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
