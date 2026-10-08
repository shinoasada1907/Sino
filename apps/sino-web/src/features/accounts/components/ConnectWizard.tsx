import { Check, ChevronDown, Lock, Plus, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Progress } from '@/shared/ui/progress'
import { ProviderIcon } from '@/shared/ui/provider-icon'
import { SinoMark } from '@/shared/ui/sino-mark'
import { Spec } from '@/shared/ui/spec'
import { Status, type StatusTone } from '@/shared/ui/status'
import { Switch } from '@/shared/ui/switch'
import type { AccountItem } from '../accounts.types'
import {
  estimateParts,
  identityName,
  initialSyncView,
  notAskedNote,
  providerDescription,
  providerTags,
  scopePurpose,
  wizardStep,
} from '../connect.format'
import { DEFAULT_SYNC_OPTIONS, type ConnectableProvider, type InitialSyncStatus, type SyncEstimate, type SyncOptions, type SyncRange } from '../connect.types'
import { isMail, scopeLabel } from '../format'
import { useConnectProviders, useStartConnect, useStartInitialSync, useSyncEstimate } from '../useConnect'

/**
 * Where the wizard is. Steps 1-3 happen before leaving for the provider (`accountId` is set when an expired account
 * signs in again, which starts at step 2); steps 4-5 happen after coming back with `?connected={accountId}` (D-47).
 */
export type WizardState =
  | { step: 1 | 2 | 3; provider: string | null; accountId: string | null }
  | { step: 4; accountId: string; options: SyncOptions }
  | { step: 5; accountId: string; status: InitialSyncStatus }


const STEPS = [1, 2, 3, 4, 5] as const

/**
 * The connect wizard of the canvas `ConnectWizard`, in the step order of the F04a redirect flow (D-47). The page that
 * opens it keeps its state, because the wizard also reopens from the address after the provider sends the user back.
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
  const startSync = useStartInitialSync()
  const sync = state?.step === 4 ? state : null
  const { estimate } = useSyncEstimate(sync?.accountId ?? null, sync?.options.range ?? DEFAULT_SYNC_OPTIONS.range)

  const go = (next: WizardState | null) => {
    startConnect.reset()
    startSync.reset()
    onChange(next)
  }

  const content = (() => {
    if (!state) {
      return null
    }
    const account = accounts.find((item) => item.id === state.accountId)
    const beforeSignIn = 'provider' in state
    const wanted = beforeSignIn ? state.provider : (account?.provider ?? null)
    const provider = providers.find((item) => item.type === wanted) ?? (beforeSignIn ? providers.find((item) => item.connectable) : undefined)
    const type = provider?.type ?? wanted ?? ''
    const identity = identityName(type, provider?.displayName ?? nameOf(type))
    const meta = wizardStep(state.step, identity)
    const canBack = state.step === 3 || (state.step === 2 && state.accountId === null)

    const next = () => {
      switch (state.step) {
        case 1:
        case 2:
          return go({ ...state, provider: type, step: state.step === 1 ? 2 : 3 })
        case 3:
          return startConnect.mutate({ provider: type, accountId: state.accountId })
        case 4:
          return startSync.mutate(
            { accountId: state.accountId, options: state.options },
            { onSuccess: (status) => go({ step: 5, accountId: state.accountId, status }) },
          )
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
          {state.step === 3 && <SignIn type={type} identity={identity} failed={startConnect.isError} />}
          {state.step === 4 && account && (
            <SyncChoice
              account={account}
              options={state.options}
              estimate={estimate ?? null}
              failed={startSync.isError}
              onOptions={(options) => go({ ...state, options })}
            />
          )}
          {state.step === 5 && account && (
            <Done account={account} status={state.status} onMore={() => go({ step: 1, provider: null, accountId: null })} />
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap justify-between gap-y-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" strokeWidth={1.6} />
            {meta.note}
          </span>
          <div className="ml-auto flex gap-2.5">
            {canBack && state.step <= 3 && (
              <Button type="button" variant="secondary" onClick={() => go({ ...state, step: state.step === 3 ? 2 : 1 })}>
                Quay lại
              </Button>
            )}
            {meta.next && (
              <Button type="button" variant="primary" disabled={startConnect.isPending || startSync.isPending} onClick={next}>
                {meta.next}
              </Button>
            )}
            {state.step === 5 && (
              <Button asChild variant="primary">
                <Link to="/inbox">Mở hộp thư</Link>
              </Button>
            )}
          </div>
        </DialogFooter>
      </>
    )
  })()

  return (
    <Dialog open={content !== null} onOpenChange={(open) => !open && go(null)}>
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

// The account row of the canvas (`.acc-row`): who is being signed in again (step 2) or was just connected (step 4).
function AccountRow({ account, tone, label }: { account: AccountItem; tone: StatusTone; label: string }) {
  return (
    <>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3">
        <AccountAvatar provider={account.provider} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{account.displayName}</span>
          <Spec className="truncate">{account.externalAccountId}</Spec>
        </div>
        <Status tone={tone}>{label}</Status>
      </div>
      <div aria-hidden="true" className="h-px bg-border" />
    </>
  )
}

// Step 2 (step 3 of the canvas, moved before the sign-in by D-47): the scopes that will be asked for, and why.
function ScopeReview({ provider, account }: { provider: ConnectableProvider; account: AccountItem | undefined }) {
  const notAsked = notAskedNote(provider.type)
  return (
    <div className="flex flex-col gap-4">
      {account && <AccountRow account={account} tone="err" label="Cần đăng nhập lại" />}
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

function FailedNotice({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-surface px-4 py-3.5 text-sm"
    >
      <TriangleAlert className="mt-px size-4.5 shrink-0 text-danger" strokeWidth={1.6} />
      {children}
    </p>
  )
}

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
      {failed && <FailedNotice>Không bắt đầu được kết nối. Hãy thử lại.</FailedNotice>}
    </div>
  )
}

const RANGES: { value: SyncRange; label: string }[] = [
  { value: 'DAYS_30', label: '30 ngày gần nhất' },
  { value: 'DAYS_90', label: '90 ngày gần nhất' },
  { value: 'ALL', label: 'Toàn bộ hộp thư' },
]

// Step 4 of the canvas, after coming back: what the first sync takes; a proposal for F04b (D-49).
function SyncChoice({
  account,
  options,
  estimate,
  failed,
  onOptions,
}: {
  account: AccountItem
  options: SyncOptions
  estimate: SyncEstimate | null
  failed: boolean
  onOptions: (options: SyncOptions) => void
}) {
  const rangeId = useId()
  const mail = isMail(account.provider)
  const parts = estimate && estimateParts(estimate)
  return (
    <div className="flex flex-col gap-4.5">
      <AccountRow account={account} tone="ok" label="Đã đăng nhập" />
      <div className="flex flex-col gap-2">
        <label htmlFor={rangeId} className="text-[13px] leading-[18px] font-semibold">
          {mail ? 'Đồng bộ thư từ' : 'Đồng bộ tin nhắn từ'}
        </label>
        <div className="relative">
          <select
            id={rangeId}
            value={options.range}
            onChange={(event) => onOptions({ ...options, range: event.target.value as SyncRange })}
            className="h-11 w-full cursor-pointer appearance-none rounded-sm border border-border bg-surface pr-10 pl-3.5 text-sm text-foreground transition-[border-color,box-shadow] duration-(--dur-hover) ease-out outline-none hover:border-border-strong focus:border-foreground focus:ring-3 focus:ring-foreground/16"
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
        </div>
        <span className="text-xs leading-4 text-muted-foreground">Thư mới nhất về trước; thư cũ hơn tiếp tục về trong nền.</span>
      </div>
      <div className="flex flex-col gap-3.5">
        {mail && (
          <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium">
            <Switch checked={options.labelsAsFilters} onCheckedChange={(labelsAsFilters) => onOptions({ ...options, labelsAsFilters })} />
            Dùng nhãn Gmail làm bộ lọc trong Sino
          </label>
        )}
        <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium">
          <Switch
            checked={options.attachmentsOnOpen}
            onCheckedChange={(attachmentsOnOpen) => onOptions({ ...options, attachmentsOnOpen })}
          />
          Chỉ tải tệp đính kèm khi bạn mở
        </label>
      </div>
      {parts && (
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 rounded-md border bg-surface px-4 py-3 text-sm text-muted-foreground">
          <span>
            Ước tính <span className="font-mono text-[13px] leading-[18px] font-medium text-foreground">{parts.messages}</span>
          </span>
          <span>
            Thời gian <span className="font-mono text-[13px] leading-[18px] font-medium text-foreground">{parts.time}</span>
          </span>
        </div>
      )}
      {failed && <FailedNotice>Chưa bắt đầu đồng bộ được. Hãy thử lại.</FailedNotice>}
    </div>
  )
}

// Step 5 of the canvas: the account is connected and its first sync is running.
function Done({ account, status, onMore }: { account: AccountItem; status: InitialSyncStatus; onMore: () => void }) {
  const progress = initialSyncView(status)
  return (
    <div className="flex flex-col items-start gap-5 pt-2">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-full text-success shadow-[inset_0_0_0_1.5px_var(--success),0_0_0_8px_color-mix(in_srgb,var(--success)_10%,transparent)]"
      >
        <Check className="size-7" strokeWidth={2} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[28px] leading-9 font-semibold tracking-[-0.018em] break-all">Đã kết nối {account.externalAccountId}</h3>
        <p className="text-sm text-muted-foreground">Sino đang đồng bộ lần đầu. Bạn dùng được ngay trong lúc chờ.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Status tone="warn">Đang đồng bộ</Status>
          <Spec>{progress.text}</Spec>
        </div>
        {progress.percent !== null && <Progress value={progress.percent} />}
      </div>
      <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onMore}>
        <Plus strokeWidth={1.6} />
        Kết nối thêm tài khoản
      </Button>
    </div>
  )
}
