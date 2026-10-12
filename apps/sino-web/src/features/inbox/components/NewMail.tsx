import { ChevronDown, Lock, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate } from 'react-router'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { defaultSender, MAX_RECIPIENTS, parseRecipients, sendingNote } from '../format'
import type { InboxAccount } from '../inbox.types'
import { lastSender, type LEAVE_FREELY, type NewMailDraft } from '../newMail'

const FIELD =
  'w-full min-w-0 rounded-sm border border-border bg-surface text-sm text-foreground transition-[border-color,box-shadow,background-color] duration-(--dur-hover) ease-out outline-none placeholder:text-subtle-foreground hover:border-border-strong focus:border-foreground focus:ring-3 focus:ring-foreground/16 aria-invalid:border-danger aria-invalid:focus:ring-danger/24'

/**
 * "Tạo thư mới" (f10-new-mail): the form of a new mail in the reading column (D-191). The canvas has no such screen, so
 * the fields follow its `.input` and the buttons its `.composer`. "Gửi" checks the recipients and the text (D-197) and
 * hands the mail to `onSend`; "Bỏ" goes back to the list. Leaving a mail with text asks first, inside the app and when
 * the tab closes. When no account can send, a notice says how to grant sending instead (D-193).
 */
export function NewMail({ accounts, backTo, onSend }: { accounts: InboxAccount[]; backTo: string; onSend?: (draft: NewMailDraft) => void }) {
  // A chat cannot start a mail.
  const choices = accounts.filter((account) => account.sending !== 'NOT_SUPPORTED')
  const [from, setFrom] = useState(() => defaultSender(choices, lastSender()))
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<{ to?: string; text?: string }>({})
  const navigate = useNavigate()
  const id = useId()
  const dirty = [to, subject, text].some((value) => value.trim() !== '')

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname && (nextLocation.state as typeof LEAVE_FREELY | null)?.newMailLeft !== true,
  )
  useEffect(() => {
    if (!dirty) {
      return
    }
    // Closing or reloading the tab: the browser asks with its own words.
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  if (from === null) {
    return <CannotSend choices={choices} />
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const recipients = parseRecipients(to)
    const found = {
      to:
        recipients.invalid.length > 0
          ? `Địa chỉ không hợp lệ: ${recipients.invalid.join(', ')}`
          : recipients.addresses.length === 0
            ? 'Nhập ít nhất một người nhận'
            : recipients.addresses.length > MAX_RECIPIENTS
              ? `Tối đa ${MAX_RECIPIENTS} người nhận`
              : undefined,
      text: text.trim() === '' ? 'Nhập nội dung thư' : undefined,
    }
    setErrors(found)
    if (!found.to && !found.text) {
      onSend?.({ accountId: from, to: recipients.addresses, subject: subject.trim(), text: text.trim() })
    }
  }

  return (
    // A column, not a grid of three rows: the header is hidden on a phone, and a hidden row would shift the others.
    <form aria-label="Thư mới" noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <header className="border-b p-4 max-md:hidden md:px-5 xl:px-6 xl:py-5">
        <h2 className="text-lg leading-6.5 font-semibold tracking-[-0.01em] md:text-xl md:leading-7">Thư mới</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:px-5 xl:px-6">
        {choices.length > 1 ? (
          <Field id={`${id}-from`} label="Từ">
            <span className="relative">
              <select
                id={`${id}-from`}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={cn(FIELD, 'h-11 cursor-pointer appearance-none pr-9 pl-3.5')}
              >
                {choices.map((account) => {
                  const note = sendingNote(account.sending)
                  return (
                    <option key={account.id} value={account.id} disabled={note !== null}>
                      {note ? `${account.address} · ${note}` : account.address}
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.6} />
            </span>
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] leading-4.5 font-semibold">Từ</span>
            <span className="text-sm">{choices[0].address}</span>
          </div>
        )}
        <Field id={`${id}-to`} label="Tới" error={errors.to}>
          <Input
            id={`${id}-to`}
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
              setErrors((current) => ({ ...current, to: undefined }))
            }}
            placeholder="ten@vi-du.com, ten-khac@vi-du.com"
            autoComplete="off"
            aria-invalid={errors.to ? true : undefined}
            aria-describedby={errors.to ? `${id}-to-error` : undefined}
          />
        </Field>
        <Field id={`${id}-subject`} label="Tiêu đề">
          <Input id={`${id}-subject`} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </Field>
        <Field id={`${id}-text`} label="Nội dung" error={errors.text} grow>
          <textarea
            id={`${id}-text`}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setErrors((current) => ({ ...current, text: undefined }))
            }}
            aria-invalid={errors.text ? true : undefined}
            aria-describedby={errors.text ? `${id}-text-error` : undefined}
            className={cn(FIELD, 'min-h-40 flex-1 resize-none px-3.5 py-3')}
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-4 pt-3 pb-6 md:px-5 md:pb-4 xl:px-6 xl:pb-5">
        <Button type="button" variant="ghost" onClick={() => navigate(backTo)}>
          Bỏ
        </Button>
        <Button type="submit" variant="primary">
          Gửi
        </Button>
      </div>
      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bỏ thư đang soạn?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>Chữ bạn đã gõ sẽ mất.</DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => blocker.reset?.()}>
              Tiếp tục soạn
            </Button>
            <Button type="button" variant="danger" onClick={() => blocker.proceed?.()}>
              Bỏ thư
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function Field({ id, label, error, grow = false, children }: { id: string; label: string; error?: string; grow?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', grow && 'min-h-0 flex-1')}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

/** No account can send: grant sending, sign in again, or add an email account (D-193). */
function CannotSend({ choices }: { choices: InboxAccount[] }) {
  const permission = choices.find((account) => account.sending === 'NEEDS_PERMISSION')
  const expired = choices.find((account) => account.sending === 'UNAVAILABLE')
  const notice = permission
    ? { title: 'Sino chưa có quyền gửi thư từ tài khoản nào', text: 'Cấp quyền gửi cho một tài khoản để soạn thư mới từ Sino.', action: 'Cấp quyền gửi', to: `/accounts?reconnect=${permission.id}` }
    : expired
      ? { title: 'Tài khoản cần đăng nhập lại trước khi gửi thư', text: `Kết nối lại ${expired.address} để soạn thư mới từ Sino.`, action: 'Kết nối lại', to: `/accounts?reconnect=${expired.id}` }
      : { title: 'Chưa có tài khoản email nào gửi được thư', text: 'Thêm một tài khoản Gmail để soạn thư mới từ Sino.', action: 'Thêm nguồn', to: '/accounts?connect=new' }
  const Icon = permission ? Lock : TriangleAlert

  return (
    <div className="p-4 md:p-5 xl:p-6">
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-md border border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-surface px-4.5 py-4"
      >
        <Icon className="size-4.5 shrink-0 text-warning" strokeWidth={1.6} />
        <div className="flex min-w-0 grow basis-56 flex-col gap-0.5">
          <span className="text-sm font-semibold">{notice.title}</span>
          <span className="text-sm text-muted-foreground">{notice.text}</span>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to={notice.to}>{notice.action}</Link>
        </Button>
      </div>
    </div>
  )
}
