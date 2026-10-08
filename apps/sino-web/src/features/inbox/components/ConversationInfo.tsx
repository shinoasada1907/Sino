import { Calendar, ChevronRight, Plus, SquareCheck, StickyNote, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { formatDayMonth } from '@/shared/time/local'
import { AccountAvatar } from '@/shared/ui/account-avatar'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import { Status } from '@/shared/ui/status'
import { Switch } from '@/shared/ui/switch'
import { formatFileSize, linkedInfoSpec, memberPlaceholder } from '../format'
import type { ConversationDetail, ConversationItem, InboxAccount, LinkedKind } from '../inbox.types'

const LINKED: Record<LinkedKind, { icon: LucideIcon; to: string }> = {
  TASK: { icon: SquareCheck, to: '/tasks' },
  EVENT: { icon: Calendar, to: '/calendar' },
  NOTE: { icon: StickyNote, to: '/notes' },
}
const SHOWN_MEMBERS = 5

/**
 * The info column of the canvas `Conversation`: linked items, members, photos and files, the account in use, the
 * notification switches. A section the backend has nothing for (null) is left out. Creating items, the switches and
 * the file rows have no flow yet (D-52).
 */
export function ConversationInfo({
  item,
  detail,
  account,
  now,
  nameOf,
  className,
}: {
  item: ConversationItem
  detail: ConversationDetail | undefined
  account: InboxAccount
  now: Date
  nameOf: ProviderNameOf
  className?: string
}) {
  const [allMembers, setAllMembers] = useState(false)
  const [muted, setMuted] = useState(false)
  const [onOverview, setOnOverview] = useState(true)
  const members = detail?.members ?? null
  const shownMembers = members && (allMembers ? members : members.slice(0, SHOWN_MEMBERS))
  const photos = detail?.files?.items.filter((file) => file.image) ?? []
  const documents = detail?.files?.items.filter((file) => !file.image) ?? []

  return (
    <aside aria-label="Thông tin cuộc trò chuyện" className={className}>
      <div className="flex min-h-0 flex-col gap-7 overflow-auto p-6">
        {detail?.linked && (
          <Section title="Việc và ghi chú" count={detail.linked.length}>
            {detail.linked.map((linked) => {
              const { icon: Icon, to } = LINKED[linked.kind]
              return (
                <Link
                  key={linked.id}
                  to={to}
                  className="-mx-3 grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-hover) ease-out outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <Icon className="size-4.5 text-muted-foreground" strokeWidth={1.6} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{linked.title}</span>
                    <Spec className="truncate">{linkedInfoSpec(linked, now)}</Spec>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.6} />
                </Link>
              )
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm">
                <Plus strokeWidth={1.6} />
                Task
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Plus strokeWidth={1.6} />
                Ghi chú
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Plus strokeWidth={1.6} />
                Lịch hẹn
              </Button>
            </div>
          </Section>
        )}

        {members && shownMembers && (
          <Section title="Thành viên" count={members.length}>
            {shownMembers.map((member) => (
              <div key={member.name} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5">
                <Avatar placeholder={memberPlaceholder(member.name, members)} className="size-7" />
                <span className="truncate text-sm">{member.name}</span>
                {member.owner ? <Badge>Trưởng nhóm</Badge> : member.joinedRecently ? <Spec>mới</Spec> : <span />}
              </div>
            ))}
            {!allMembers && members.length > SHOWN_MEMBERS && (
              <Button type="button" variant="ghost" size="sm" className="-ml-3 self-start" onClick={() => setAllMembers(true)}>
                Xem thêm {members.length - SHOWN_MEMBERS} người
              </Button>
            )}
          </Section>
        )}

        {detail?.files && (
          <Section title="Ảnh và tệp" count={detail.files.total}>
            {photos.length > 0 && (
              <div role="img" aria-label={`${photos.length} ảnh gần nhất`} className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <span
                    key={photo.name}
                    className="block aspect-square rounded-[10px] border bg-[repeating-linear-gradient(135deg,var(--surface)_0_8px,var(--raised)_8px_16px)]"
                  />
                ))}
              </div>
            )}
            {documents.map((file) => (
              <button
                key={file.name}
                type="button"
                className="inline-flex h-13 cursor-pointer items-center gap-2.5 rounded-sm border bg-raised pr-3.5 pl-2 text-left text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[8px] border bg-surface font-mono text-[10px] leading-none font-semibold tracking-[0.04em] text-muted-foreground">
                  {file.type}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{file.name}</span>
                  <Spec>
                    {formatFileSize(file.sizeBytes)} · {formatDayMonth(new Date(file.at))}
                  </Spec>
                </span>
              </button>
            ))}
          </Section>
        )}

        <Section title="Tài khoản dùng">
          <Link
            to={`/accounts/${account.id}`}
            className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <AccountAvatar provider={account.provider} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold">{nameOf(item.provider)}</span>
              <Spec className="truncate">{account.externalAccountId}</Spec>
            </span>
            {account.syncProgress !== null ? (
              <Status tone="warn">{account.syncProgress}%</Status>
            ) : account.status === 'AUTH_EXPIRED' ? (
              <Status tone="err">Ngắt</Status>
            ) : (
              <Status tone="ok">Đồng bộ</Status>
            )}
          </Link>
        </Section>

        <div className="flex flex-col gap-3.5">
          <SwitchRow label={item.memberCount ? 'Tắt thông báo nhóm này' : 'Tắt thông báo cuộc trò chuyện này'} checked={muted} onChange={setMuted} />
          <SwitchRow label="Hiện trong Tổng quan" checked={onOverview} onChange={setOnOverview} />
        </div>
      </div>
    </aside>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-xs leading-4 font-semibold text-muted-foreground">
          {title}
        </h2>
        {count !== undefined && <Spec>{count}</Spec>}
      </div>
      {children}
    </section>
  )
}

// Local only: muting and showing on the overview are settings the data contract does not carry yet.
function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 self-start text-sm font-medium">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}
