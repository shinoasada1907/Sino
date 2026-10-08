import { Link2Off } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
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
import { Switch } from '@/shared/ui/switch'
import type { AccountItem } from '../accounts.types'
import { disconnectPrompt } from '../format'
import { useDisconnectAccount } from '../useAccounts'

/**
 * The disconnect confirmation of the canvas `Overlays`, opened by `trigger`. Confirming removes the account and goes
 * back to the list; "Hủy", the close button and Esc change nothing.
 */
export function DisconnectDialog({ account, nameOf, trigger }: { account: AccountItem; nameOf: ProviderNameOf; trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const [deleteMessages, setDeleteMessages] = useState(false)
  const disconnect = useDisconnectAccount()
  const navigate = useNavigate()
  const prompt = disconnectPrompt(account, nameOf)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setDeleteMessages(false)
    }
  }
  const confirm = () =>
    disconnect.mutate(
      { accountId: account.id, deleteMessages },
      {
        onSuccess: () => {
          changeOpen(false)
          navigate('/accounts')
        },
      },
    )

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{prompt.text}</DialogDescription>
          <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium">
            <Switch checked={deleteMessages} onCheckedChange={setDeleteMessages} />
            {prompt.deleteLabel}
          </label>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Hủy
            </Button>
          </DialogClose>
          <Button type="button" variant="danger" disabled={disconnect.isPending} onClick={confirm}>
            <Link2Off strokeWidth={1.6} />
            Ngắt kết nối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
