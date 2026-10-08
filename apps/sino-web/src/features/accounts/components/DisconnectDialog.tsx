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
import type { AccountItem } from '../accounts.types'
import { disconnectPrompt } from '../format'
import { useDisconnectAccount } from '../useAccounts'

/**
 * The disconnect confirmation of the canvas `Overlays`, opened by `trigger`. Confirming removes the account and goes
 * back to the list; "Hủy", the close button and Esc change nothing. The stored messages are kept: the switch to delete
 * them waits for F05, which decides what removing an account does to its history (D-56).
 */
export function DisconnectDialog({ account, nameOf, trigger }: { account: AccountItem; nameOf: ProviderNameOf; trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  const disconnect = useDisconnectAccount()
  const navigate = useNavigate()
  const prompt = disconnectPrompt(account, nameOf)

  const confirm = () =>
    disconnect.mutate(
      { accountId: account.id },
      {
        onSuccess: () => {
          setOpen(false)
          navigate('/accounts')
        },
      },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{prompt.text}</DialogDescription>
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
