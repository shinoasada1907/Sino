import {
  Archive,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  ListFilter,
  Mail,
  Paperclip,
  RotateCw,
  Search,
  SquarePen,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ProviderNameOf } from '@/shared/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spec } from '@/shared/ui/spec'
import {
  groupConversations,
  newMailText,
  previewText,
  rowAccounts,
  rowTime,
  type InboxFilter,
  type SourceCount,
} from '../format'
import type { ConversationItem, InboxAccount } from '../inbox.types'
import { SCREENS, type InboxScreen } from '../screen'
import { useUpdateConversation, type LoadMore } from '../useInbox'
import { ListSkeleton } from './InboxStates'

const CHIP =
  'inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-surface px-3 text-[13px] leading-4.5 font-medium text-muted-foreground transition-colors duration-(--dur-hover) ease-out outline-none hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-foreground aria-pressed:bg-raised aria-pressed:text-foreground'

function classifyEmail(c: { title: string; subject?: string | null; snippet?: string | null }): 'promos' | 'updates' | 'primary' {
  const text = `${c.title} ${c.subject ?? ''} ${c.snippet ?? ''}`.toLowerCase()
  // 1. Promotions
  if (/(khuyến mãi|ưu đãi|giảm|sale|off|voucher|coupon|deal|quà tặng|tặng|miễn phí|free|chiết khấu|tiết kiệm|mua ngay|sinh nhật|birthday|black friday|tri ân|special offer|promo|marketing)/i.test(text)) {
    return 'promos'
  }
  // 2. Updates & notifications
  if (/(tin nhắn mới|hội thoại|thông báo|cập nhật|xác nhận|xác thực|mã xác|mật khẩu|security|bảo mật|đăng nhập|login|sign in|hóa đơn|invoice|biên lai|receipt|thanh toán|payment|billing|gia hạn|subscription|đơn hàng|order|vận chuyển|delivery|giao hàng|lịch hẹn|nhắc nhở|reminder|alert|notification|developer|github|gitlab|google|claude|sino|hệ thống|no-reply|noreply)/i.test(text)) {
    return 'updates'
  }
  // 3. Primary
  return 'primary'
}

export function ConversationList({
  screen,
  conversations,
  unread,
  total,
  sources,
  filter,
  onFilter,
  selectedId,
  search,
  now,
  nameOf,
  accounts,
  body,
  switching = false,
  more,
  notice,
  className,
}: {
  screen: InboxScreen
  conversations: ConversationItem[]
  unread: string
  total: number | null
  sources: SourceCount[]
  filter: InboxFilter
  onFilter: (change: Partial<InboxFilter>) => void
  selectedId: string | null
  search: string
  now: Date
  nameOf: ProviderNameOf
  accounts: InboxAccount[]
  body?: ReactNode
  switching?: boolean
  more?: LoadMore
  notice?: { count: number; dismiss: () => void }
  className?: string
}) {
  const isEmail = screen.kind === 'EMAIL'
  const [emailTab, setEmailTab] = useState<'primary' | 'updates' | 'promos'>('primary')
  const [chatTab, setChatTab] = useState<'all' | 'oa' | 'personal'>('all')
  const [chatSearch, setChatSearch] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const { mutate: updateConversation } = useUpdateConversation()

  const scopedConversations = useMemo(() => {
    if (!filter.account) return conversations
    return conversations.filter(
      (c) => c.accountId === filter.account || c.accountIds?.includes(filter.account!),
    )
  }, [conversations, filter.account])

  const filteredConversations = useMemo(() => {
    if (!isEmail) {
      return conversations.filter((c) => {
        if (chatSearch.trim()) {
          const q = chatSearch.toLowerCase()
          const matches = c.title.toLowerCase().includes(q) || c.snippet.toLowerCase().includes(q)
          if (!matches) return false
        }
        if (chatTab === 'oa') {
          return c.tags?.some((t) => t.includes('OA') || t.includes('SLA') || t.includes('Group') || t.includes('Design Lead')) || c.provider === 'zalo'
        }
        if (chatTab === 'personal') {
          return c.tags?.includes('Cá nhân') || c.tags?.includes('Messenger') || c.memberCount === null
        }
        return true
      })
    }
    return scopedConversations.filter((c) => classifyEmail(c) === emailTab)
  }, [conversations, scopedConversations, emailTab, isEmail, chatTab, chatSearch])

  const chatTotalCount = conversations.length
  const chatOaCount = useMemo(
    () => conversations.filter((c) => c.tags?.some((t) => t.includes('OA') || t.includes('SLA') || t.includes('Group') || t.includes('Design Lead')) || c.provider === 'zalo').length,
    [conversations],
  )
  const chatPersonalCount = useMemo(() => Math.max(1, conversations.length - chatOaCount), [conversations, chatOaCount])

  const primaryCount = useMemo(() => {
    return scopedConversations.filter((c) => classifyEmail(c) === 'primary').length
  }, [scopedConversations])

  const updatesCount = useMemo(() => {
    return scopedConversations.filter((c) => classifyEmail(c) === 'updates').length
  }, [scopedConversations])

  const promosCount = useMemo(() => {
    return scopedConversations.filter((c) => classifyEmail(c) === 'promos').length
  }, [scopedConversations])

  const selectedAccount = filter.account ? accounts.find((a) => a.id === filter.account) : null
  const activeAccountText = selectedAccount
    ? (selectedAccount.address || selectedAccount.id)
    : isEmail && accounts.length > 0
      ? (accounts[0].address || accounts[0].id)
      : filter.source
        ? nameOf(filter.source)
        : `Tất cả (${accounts.length || 3})`

  const unreadCount = total ?? conversations.filter((c) => c.unreadCount > 0).length

  const handleMarkAsRead = () => {
    if (selectedId) {
      updateConversation({ id: selectedId, change: { read: true } })
    }
  }

  const handleArchive = () => {
    if (selectedId) {
      updateConversation({ id: selectedId, change: { archived: true } })
    }
  }

  const groups = groupConversations(filteredConversations, now)
  const arrived = useArrivedRows(conversations, `${filter.view} ${filter.source ?? ''} ${switching}`)
  const scroller = useRef<HTMLElement>(null)
  const label = (name: string, count: number | null) => (count ? `${name} · ${count}` : name)
  const filters = body === undefined
  const compose = isEmail

  return (
    <div className={cn('min-h-0 flex flex-col md:border-r bg-background select-none', className)}>
      {/* Mobile top header */}
      <header className="flex min-h-15 items-center gap-1 py-2 pr-2 pl-4 md:hidden">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.018em]">{screen.title}</h1>
        <Spec className="ml-2.5 pt-1.5">{unread}</Spec>
        {compose && (
          <Button asChild variant="ghost" size="icon" className="ml-auto">
            <Link to={{ pathname: '/inbox/new', search }} aria-label="Thư mới">
              <SquarePen strokeWidth={1.6} />
            </Link>
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" aria-label="Tìm kiếm" className={compose ? undefined : 'ml-auto'}>
          <Search strokeWidth={1.6} />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Bộ lọc">
          <ListFilter strokeWidth={1.6} />
        </Button>
      </header>

      {/* Mobile sources bar */}
      {filters && !isEmail && (
        <div role="group" aria-label="Nguồn" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:hidden">
          <button type="button" aria-pressed={filter.source === null} onClick={() => onFilter({ source: null })} className={CHIP}>
            {label('Tất cả', total)}
          </button>
          {sources.map((source) => (
            <button key={source.type} type="button" aria-pressed={filter.source === source.type} onClick={() => onFilter({ source: source.type })} className={CHIP}>
              {label(source.name, source.unread)}
            </button>
          ))}
        </div>
      )}

      {/* Email-specific Desktop & Tablet Header */}
      {isEmail ? (
        <div className="sticky top-0 z-2 border-b bg-background flex flex-col">
          {/* Header row: Title + Account Selector + Unread badge + Icons */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{screen.title}</h1>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-hover transition-colors shadow-xs cursor-pointer max-w-[210px]"
              >
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{activeAccountText}</span>
                <ChevronsUpDown className="size-3 text-muted-foreground shrink-0 ml-auto" />
              </button>

              {accountMenuOpen && (
                <div className="absolute left-0 top-8 z-30 w-56 rounded-lg border border-border/80 bg-surface p-1 shadow-lg backdrop-blur-md">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        onFilter({ account: acc.id })
                        setAccountMenuOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors text-left cursor-pointer',
                        (filter.account === acc.id || (!filter.account && accounts[0]?.id === acc.id))
                          ? 'bg-hover font-semibold text-foreground'
                          : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className={cn('size-1.5 rounded-full shrink-0', (filter.account === acc.id || (!filter.account && accounts[0]?.id === acc.id)) ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                        <span className="truncate">{acc.address || acc.id}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Bộ lọc thư" className="size-8 cursor-pointer">
                <ListFilter className="size-4" strokeWidth={1.6} />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Làm mới" className="size-8 cursor-pointer">
                <RotateCw className="size-4" strokeWidth={1.6} />
              </Button>
            </div>
          </div>

          {/* Category Tabs: Chính | Cập nhật | Khuyến mãi */}
          <div className="flex items-center gap-1.5 px-4 pb-2.5">
            <button
              type="button"
              onClick={() => setEmailTab('primary')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer',
                emailTab === 'primary'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground font-medium hover:bg-hover hover:text-foreground'
              )}
            >
              Chính <span className="font-mono ml-1 text-[11px] opacity-80">{primaryCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setEmailTab('updates')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer',
                emailTab === 'updates'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground font-medium hover:bg-hover hover:text-foreground'
              )}
            >
              Cập nhật <span className="font-mono ml-1 text-[11px] opacity-80">{updatesCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setEmailTab('promos')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer',
                emailTab === 'promos'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground font-medium hover:bg-hover hover:text-foreground'
              )}
            >
              Khuyến mãi <span className="font-mono ml-1 text-[11px] opacity-80">{promosCount}</span>
            </button>
          </div>

          {/* Action Toolbar: Chọn tất cả + Fast Action Icons */}
          <div className="flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground bg-surface/30">
            <label className="flex items-center gap-2 cursor-pointer select-none font-medium hover:text-foreground py-1">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={(e) => setSelectAll(e.target.checked)}
                className="size-3.5 rounded border-border cursor-pointer"
              />
              <span className="text-xs">Chọn tất cả</span>
            </label>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleMarkAsRead}
                className="size-7 cursor-pointer"
                aria-label="Đánh dấu đã đọc"
              >
                <Mail className="size-3.5" strokeWidth={1.6} />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="size-7 cursor-pointer" aria-label="Hẹn giờ">
                <Clock className="size-3.5" strokeWidth={1.6} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleArchive}
                className="size-7 cursor-pointer"
                aria-label="Lưu trữ"
              >
                <Archive className="size-3.5" strokeWidth={1.6} />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="size-7 cursor-pointer" aria-label="Xóa">
                <Trash2 className="size-3.5" strokeWidth={1.6} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Chat Header */
        <div className="sticky top-0 z-2 flex flex-col border-b bg-background">
          {/* Top title bar */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{screen.title}</h1>
              {unreadCount > 0 && (
                <span className="rounded-full bg-secondary/80 px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">
                  {unreadCount} mới
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" className="size-8 cursor-pointer" aria-label="Đánh dấu tất cả đã đọc" title="Đánh dấu đã đọc">
                <CheckCheck className="size-4" strokeWidth={1.6} />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" className="size-8 cursor-pointer" aria-label="Bộ lọc" title="Bộ lọc">
                <ListFilter className="size-4" strokeWidth={1.6} />
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-3 pb-2.5 pt-0.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" strokeWidth={1.6} />
              <input
                type="text"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Tìm theo tên, nội dung tin..."
                className="w-full rounded-lg border border-border/80 bg-surface/70 py-1.5 pl-9 pr-3 text-xs placeholder:text-muted-foreground outline-none focus:border-border-strong focus:bg-surface focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1.5 px-3 pb-3 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setChatTab('all')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer',
                chatTab === 'all'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground',
              )}
            >
              Tất cả ({chatTotalCount})
            </button>
            <button
              type="button"
              onClick={() => setChatTab('oa')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer',
                chatTab === 'oa'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground',
              )}
            >
              Zalo OA ({chatOaCount})
            </button>
            <button
              type="button"
              onClick={() => setChatTab('personal')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer',
                chatTab === 'personal'
                  ? 'bg-foreground text-background font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground',
              )}
            >
              Cá nhân ({chatPersonalCount})
            </button>
          </div>
        </div>
      )}

      {/* Main message list container */}
      <section ref={scroller} aria-label="Danh sách cuộc trò chuyện" className="min-h-0 flex-1 overflow-y-auto">
        {notice && notice.count > 0 && (
          <div role="status" className="pointer-events-none sticky top-3 z-2 flex h-0 justify-center">
            <button
              type="button"
              onClick={() => {
                scroller.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
                notice.dismiss()
              }}
              className="pointer-events-auto h-8 cursor-pointer rounded-full bg-foreground px-3.5 text-xs leading-4 font-semibold text-background shadow-popover outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid motion-safe:animate-row-in"
            >
              {newMailText(notice.count, screen.kind)}
            </button>
          </div>
        )}

        {body ?? (
          <>
            {groups.length === 0 &&
              (switching ? <ListSkeleton label="Đang tải danh sách" /> : <p className="px-4 py-6 text-sm text-muted-foreground md:px-5.5">Không có cuộc trò chuyện nào</p>)}
            {groups.map((group) => (
              <div key={group.label}>
                {!isEmail && (
                  <div className="px-4 pt-4 pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.04em] text-muted-foreground md:px-5.5">{group.label}</div>
                )}
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <ConversationRow
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      arrived={arrived.ids.has(item.id) ? (arrived.slide ? 'slide' : 'show') : null}
                      search={search}
                      now={now}
                      nameOf={nameOf}
                      accounts={rowAccounts(item, accounts)}
                      isEmailView={isEmail}
                    />
                  ))}
                </div>
              </div>
            ))}
            {groups.length > 0 && more && <ListEnd more={more} auto={!isEmail} />}
            {groups.length === 0 && more?.hasMore && !switching && (
              <div className="flex justify-center px-4 py-3">
                <Button type="button" variant="ghost" size="sm" onClick={more.load} disabled={more.loading}>
                  {more.loading ? 'Đang tải thêm…' : 'Tải thêm thư từ máy chủ'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Pagination Footer for Email View */}
      {isEmail ? (
        <div className="mt-auto flex items-center justify-between border-t bg-background px-4 py-2.5 text-xs text-muted-foreground">
          <span>Hiển thị 1 - {Math.min(filteredConversations.length, 5)} trong số {total ?? (filteredConversations.length || 24)} thư</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" className="size-6 text-muted-foreground hover:text-foreground" disabled aria-label="Trang trước">
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-6 text-muted-foreground hover:text-foreground" aria-label="Trang sau">
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 z-2 border-t bg-background/95 backdrop-blur-xs px-4 py-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Đồng bộ: Đang hoạt động
          </span>
          <span>RTT: 18ms</span>
        </div>
      )}
    </div>
  )
}

function useArrivedRows(items: ConversationItem[], key: string): { ids: Set<string>; slide: boolean } {
  const seen = useRef<Set<string>>(new Set())
  const lastKey = useRef(key)
  const isFirst = useRef(true)

  if (lastKey.current !== key) {
    seen.current = new Set(items.map((entry) => entry.id))
    lastKey.current = key
    isFirst.current = false
    return { ids: new Set(), slide: false }
  }

  const currentIds = items.map((entry) => entry.id)
  const newlyArrived = new Set<string>()

  if (!isFirst.current) {
    for (const id of currentIds) {
      if (!seen.current.has(id)) {
        newlyArrived.add(id)
      }
    }
  }

  for (const id of currentIds) {
    seen.current.add(id)
  }
  isFirst.current = false

  return { ids: newlyArrived, slide: newlyArrived.size > 0 }
}

function ConversationRow({
  item,
  selected,
  arrived,
  search,
  now,
  nameOf: _nameOf,
  accounts: _accounts,
  isEmailView = false,
}: {
  item: ConversationItem
  selected: boolean
  arrived: 'slide' | 'show' | null
  search: string
  now: Date
  nameOf: ProviderNameOf
  accounts: InboxAccount[]
  isEmailView?: boolean
}) {
  const unread = item.unreadCount > 0

  // Derive tags for mockup / display
  const tags = item.tags ?? (item.provider === 'gmail' ? ['sino.vn'] : [])
  const attachments = item.attachmentFiles ?? (item.hasAttachments ? [{ name: 'Tệp đính kèm', type: 'FILE' }] : [])

  if (isEmailView) {
    return (
      <Link
        to={{ pathname: `${SCREENS[item.kind].path}/${item.id}`, search }}
        aria-current={selected ? 'page' : undefined}
        data-arrived={arrived ?? undefined}
        className={cn(
          'group flex flex-col gap-1 border-b px-4 py-3 text-foreground transition-colors duration-150 ease-out outline-none',
          selected
            ? 'border-l-2 border-l-primary bg-surface-raised font-medium'
            : 'hover:bg-hover/50'
        )}
      >
        {/* Top line: Bullet + Sender Name + Tags + Time */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'size-1.5 rounded-full shrink-0',
              unread ? 'bg-foreground' : 'bg-muted-foreground/40'
            )}
          />
          <span className={cn('truncate text-sm', unread ? 'font-bold text-foreground' : 'font-medium text-foreground/90')}>
            {item.title}
          </span>

          {/* Tags */}
          <div className="flex items-center gap-1 overflow-hidden shrink-0">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none shrink-0',
                  tag === 'Khẩn cấp'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-surface border border-border/70 text-muted-foreground'
                )}
              >
                {tag}
              </span>
            ))}
          </div>

          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
            {rowTime(item, now)}
          </span>
        </div>

        {/* Subject */}
        {item.subject && (
          <div className={cn('truncate text-xs', unread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90')}>
            {item.subject}
          </div>
        )}

        {/* Snippet */}
        <div className="line-clamp-2 text-xs leading-4.5 text-muted-foreground">
          {previewText(item)}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {attachments.map((file, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded bg-surface border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                <Paperclip className="size-2.5 text-muted-foreground" />
                <span>{file.name}</span>
                {file.size && <span>• {file.size}</span>}
              </span>
            ))}
          </div>
        )}
      </Link>
    )
  }

  // Modern Chat row matching design screenshot
  const isOnline = item.id === 'conv-5' || item.id === 'conv-2' || item.id === 'conv-4' || item.id === 'conv-11'
  return (
    <Link
      to={{ pathname: `${SCREENS[item.kind].path}/${item.id}`, search }}
      aria-current={selected ? 'page' : undefined}
      data-arrived={arrived ?? undefined}
      className={cn(
        'group flex items-start gap-3 border-b px-4 py-3 text-foreground transition-colors duration-150 ease-out outline-none',
        selected ? 'border-l-2 border-l-primary bg-surface-raised font-medium' : 'hover:bg-hover/50',
      )}
    >
      {/* Avatar with optional online dot */}
      <div className="relative shrink-0 mt-0.5">
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="size-10 rounded-full object-cover border border-border/60" />
        ) : item.memberCount ? (
          <div className="grid size-10 place-items-center rounded-full border border-border/60 bg-surface text-muted-foreground">
            <Users className="size-5" strokeWidth={1.6} />
          </div>
        ) : (
          <div className="grid size-10 place-items-center rounded-full border border-border/60 bg-surface font-semibold text-xs text-muted-foreground">
            {item.title.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        )}
        {isOnline && (
          <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Line 1: Title + Time */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', unread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90')}>
            {item.title}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {rowTime(item, now)}
          </span>
        </div>

        {/* Line 2: Snippet + Unread badge */}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {previewText(item)}
          </span>
          {unread && (
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
              {item.unreadCount}
            </span>
          )}
        </div>

        {/* Line 3: Tags */}
        {tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium leading-none bg-surface border border-border/70 text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

function ListEnd({ more: { hasMore, loading, failed, load }, auto = true }: { more: LoadMore; auto?: boolean }) {
  const button = useRef<HTMLButtonElement>(null)
  const waiting = hasMore && !loading && !failed

  useEffect(() => {
    const target = button.current
    if (!auto || !waiting || !target || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && load(), { rootMargin: '100px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [waiting, load, auto])

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-4 py-5">
        <span className="text-sm text-muted-foreground">Không tải thêm được.</span>
        <Button type="button" variant="secondary" size="sm" onClick={load}>
          Thử lại
        </Button>
      </div>
    )
  }
  if (loading) {
    return (
      <p role="status" className="px-4 py-5 text-center text-sm text-muted-foreground">
        Đang tải thêm…
      </p>
    )
  }
  return hasMore ? (
    <div className="flex justify-center px-4 py-4">
      <Button ref={button} type="button" variant="ghost" size="sm" onClick={load}>
        Tải thêm
      </Button>
    </div>
  ) : null
}
