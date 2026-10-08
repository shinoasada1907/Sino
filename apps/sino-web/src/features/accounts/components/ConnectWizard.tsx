import { Check, Lock, TriangleAlert } from 'lucide-react'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { SinoMark } from '@/shared/ui/sino-mark'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import type { AccountItem } from '../accounts.types'
import { identityName, notAskedNote, providerDescription, providerTags, scopePurpose, wizardStep } from '../connect.format'
import type { ConnectableProvider } from '../connect.types'
import { scopeLabel } from '../format'
import { useConnectProviders, useStartConnect } from '../useConnect'

/** Where the wizard is. `accountId` is set when an expired account signs in again (it then starts at step 2). */
export type WizardState = { step: 1 | 2 | 3; provider: string | null; accountId: string | null }

const STEPS = [1, 2, 3, 4, 5] as const

/**
 * The connect wizard of the canvas `ConnectWizard`, in the step order of the F04a redirect flow (D-47): provider,
 * scopes, sign-in on the provider's page. The page that opens it keeps its state.
 */
export function ConnectWizard({
  state,
  onChange,
  accounts,
  nameOf,
}: {
  state: WizardState | null
  onChange: (state: WizardState | null) => void
  accounts: AccountItem[]
  nameOf: ProviderNameOf
}) {
  const { providers = [] } = useConnectProviders()
  const startConnect = useStartConnect()

  const go = (next: WizardState | null) => {
    startConnect.reset()
    onChange(next)
  }

  const content = (() => {
    if (!state) {
      return null
    }
    const provider = providers.find((item) => item.type === state.provider) ?? providers.find((item) => item.connectable)
    const type = provider?.type ?? state.provider ?? ''
    const identity = identityName(type, provider?.displayName ?? nameOf(type))
    const meta = wizardStep(state.step, identity)
    const account = accounts.find((item) => item.id === state.accountId)
    const canBack = state.step === 3 || (state.step === 2 && state.accountId === null)
    const next = () => {
      if (state.step === 3) {
        startConnect.mutate({ provider: type, accountId: state.accountId })
      } else {
        go({ ...state, provider: type, step: state.step === 1 ? 2 : 3 })
      }
    }

    return (
      <>
        <DialogHeader>
          <span className="text-xs leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Kết nối tài khoản · {state.step}/5
          </span>
          <DialogTitle>{meta.title}</DialogTitle>
        </DialogHeader>
        <ol aria-label="Các bước" className="grid grid-cols-5 gap-2 px-6 pt-4.5">
          {STEPS.map((step) => (
            <li key={step} aria-current={step === state.step ? 'step' : undefined} className="flex min-w-0 flex-col gap-2">
              <span
                className={cn(
                  'block h-0.75 rounded-[2px] bg-border',
                  step < state.step && 'bg-muted-foreground',
                  step === state.step && 'bg-foreground',
                )}
              />
              <Spec className={cn('truncate', step === state.step && 'text-foreground')}>{wizardStep(step, identity).label}</Spec>
            </li>
          ))}
        </ol>
        <DialogBody className="min-h-0 flex-1 gap-3.5 overflow-y-auto sm:min-h-93">
          {state.step === 1 && (
            <ProviderChoice providers={providers} selected={type} onSelect={(picked) => go({ ...state, provider: picked })} />
          )}
          {state.step === 2 && provider && <ScopeReview provider={provider} account={account} />}
          {state.step === 3 && (
            <SignIn type={type} identity={identity} failed={startConnect.isError} />
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap justify-between gap-y-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" strokeWidth={1.6} />
            {meta.note}
          </span>
          <div className="ml-auto flex gap-2.5">
            {canBack && (
              <Button type="button" variant="secondary" onClick={() => go({ ...state, step: state.step === 3 ? 2 : 1 })}>
                Quay lại
              </Button>
            )}
            {meta.next && (
              <Button type="button" variant="primary" disabled={startConnect.isPending} onClick={next}>
                {meta.next}
              </Button>
            )}
          </div>
        </DialogFooter>
      </>
    )
  })()

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && go(null)}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100svh-2rem)] sm:max-w-160">
        {content}
      </DialogContent>
    </Dialog>
  )
}

// Step 1, canvas `.opt`: one radio per provider; one without a connect flow is shown as "Sắp có" and disabled (D-50).
function ProviderChoice({
  providers,
  selected,
  onSelect,
}: {
  providers: ConnectableProvider[]
  selected: string
  onSelect: (type: string) => void
}) {
  return (
    <div role="radiogroup" aria-label="Nhà cung cấp" className="flex flex-col gap-2.5">
      {providers.map((provider) => {
        const description = providerDescription(provider.type)
        return (
          <label
            key={provider.type}
            className={cn(
              'grid cursor-pointer grid-cols-[18px_36px_minmax(0,1fr)_auto] items-center gap-x-3.5 rounded-xl border bg-surface px-4 py-3.5 transition-[border-color,background-color] duration-(--dur-hover) ease-out hover:border-border-strong has-checked:border-foreground has-checked:bg-raised',
              !provider.connectable && 'cursor-not-allowed opacity-50 hover:border-border',
            )}
          >
            <input
              type="radio"
              name="connect-provider"
              value={provider.type}
              checked={provider.type === selected}
              disabled={!provider.connectable}
              onChange={() => onSelect(provider.type)}
              className="size-4.5 cursor-pointer appearance-none rounded-full border-[1.5px] border-border-strong transition-[border-width] duration-(--dur-fast) ease-out outline-none checked:border-[5px] checked:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
            />
            <span className="grid size-9 place-items-center rounded-sm border bg-raised text-foreground">
              <ProviderIcon provider={provider.type} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{provider.displayName}</span>
              {description && <span className="truncate text-sm text-muted-foreground">{description}</span>}
            </span>
            <span className="flex gap-1.5">
              {providerTags(provider).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// Step 2 (step 3 of the canvas, moved before the sign-in by D-47): the scopes that will be asked for, and why.
function ScopeReview({ provider, account }: { provider: ConnectableProvider; account: AccountItem | undefined }) {
  const notAsked = notAskedNote(provider.type)
  return (
    <div className="flex flex-col gap-4">
      {account && (
        <>
          <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3">
            <AccountAvatar provider={account.provider} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{account.displayName}</span>
              <Spec className="truncate">{account.externalAccountId}</Spec>
            </div>
            <Status tone="err">Cần đăng nhập lại</Status>
          </div>
          <div aria-hidden="true" className="h-px bg-border" />
        </>
      )}
      {provider.scopes.length > 0 ? (
        <div>
          {provider.scopes.map((code) => (
            <div key={code} className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-x-3 border-t py-3 first:border-t-0 first:pt-0">
              <Check className="mt-0.5 size-4.5" strokeWidth={1.6} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">{scopeLabel(code)}</span>
                {scopePurpose(code) && <span className="text-[13px] leading-[18px] text-muted-foreground">{scopePurpose(code)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        account && <p className="text-sm text-muted-foreground">Sino xin lại đúng những quyền bạn đã cấp lần trước.</p>
      )}
      {notAsked && <p className="text-sm text-muted-foreground">{notAsked}</p>}
    </div>
  )
}

const DASH = 'block h-px w-18 bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_6px,transparent_6px_12px)]'

// Step 3 (step 2 of the canvas without the popup, D-47): the next button leaves Sino for the provider's page.
function SignIn({ type, identity, failed }: { type: string; identity: string; failed: boolean }) {
  return (
    <div className="flex flex-col gap-5 pt-2">
      <div aria-hidden="true" className="flex items-center gap-3.5">
        <span className="grid size-10 place-items-center rounded-xl border bg-raised text-foreground">
          <SinoMark className="size-5" />
        </span>
        <span className={DASH} />
        <span className="grid size-7 place-items-center rounded-[7px] border bg-raised text-foreground">
          <Lock className="size-3.5" strokeWidth={1.6} />
        </span>
        <span className={DASH} />
        <span className="grid size-10 place-items-center rounded-xl border bg-raised text-foreground">
          <ProviderIcon provider={type} className="size-5" />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">Đăng nhập bằng {identity}</h3>
        <p className="max-w-125 text-sm text-muted-foreground">
          Sino chuyển bạn sang trang của {identity}. Đăng nhập và chọn tài khoản bạn muốn kết nối. Sino không bao giờ thấy mật
          khẩu của bạn.
        </p>
      </div>
      {failed && (
        <p
          role="alert"
          className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
          Không bắt đầu được kết nối. Hãy thử lại.
        </p>
      )}
    </div>
  )
}
