import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import type { ConversationItem } from '../inbox.types'
import { NICKNAME_MAX, nicknameFailure } from '../nickname'
import { useSetNickname } from '../useInbox'

/**
 * The "Đặt biệt danh" box of a 1-1 Zalo chat (zalo-nicknames, canvas `MessagesNickname` and `MobileNickname`: a modal on a
 * wide screen, a sheet from the bottom on a phone). Saving waits for the server, which asks Zalo first (D-420): the box
 * closes only when it answers, and a refusal shows inside it and keeps what was typed. Enter saves, Esc closes, and the
 * field has the focus when the box opens.
 */
export function NicknameDialog({ item, open, onOpenChange }: { item: ConversationItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Radix focuses the first control it finds; the field is the one that matters, with its text selected to retype.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const field = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector('input') : null
          field?.focus()
          field?.select()
        }}
        className="max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-xl max-sm:rounded-b-none"
      >
        <NicknameForm item={item} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

// Mounted with the box, so each opening starts from the saved nickname and with no earlier error.
function NicknameForm({ item, close }: { item: ConversationItem; close: () => void }) {
  const [text, setText] = useState(item.nickname ?? '')
  const save = useSetNickname()
  const errorId = useId()
  const formId = useId()
  const error = save.isError ? nicknameFailure(save.error) : null
  const unchanged = text.trim() === (item.nickname ?? '')

  const submit = (nickname: string) => save.mutate({ id: item.id, nickname }, { onSuccess: close })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!unchanged && !save.isPending) {
      submit(text.trim())
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Đặt biệt danh</DialogTitle>
        <DialogDescription>Biệt danh được đặt trong Zalo của bạn, nên cũng hiện trên điện thoại. Chỉ bạn thấy.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor={`${formId}-input`} className="text-sm leading-5 font-medium">
            Biệt danh
          </label>
          <Input
            id={`${formId}-input`}
            type="text"
            value={text}
            maxLength={NICKNAME_MAX}
            placeholder="Ví dụ: Em Hà"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value)
              if (save.isError) {
                save.reset()
              }
            }}
          />
          {error && (
            <span id={errorId} role="alert" className="text-sm leading-5 text-danger-ink">
              {error}
            </span>
          )}
          <span className="text-xs leading-4 text-muted-foreground">
            Tên Zalo: {item.title} · tối đa {NICKNAME_MAX} ký tự
          </span>
        </form>
      </DialogBody>
      <DialogFooter className="justify-between">
        <span>
          {item.nickname && (
            <Button type="button" variant="ghost" className="text-danger-ink" disabled={save.isPending} onClick={() => submit('')}>
              <Trash2 strokeWidth={1.6} />
              Xóa biệt danh
            </Button>
          )}
        </span>
        <span className="inline-flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Hủy
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={unchanged || save.isPending}>
            Lưu
          </Button>
        </span>
      </DialogFooter>
    </>
  )
}
