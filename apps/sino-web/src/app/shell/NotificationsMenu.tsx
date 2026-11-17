import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Inbox, MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { fetchConversations, markAllConversationsRead, updateConversation } from '@/features/inbox/inbox.api'
import { newMailText } from '@/features/inbox/format'
import { SCREENS } from '@/features/inbox/screen'
import type { ProviderKind } from '@/shared/domain'
import { cn } from '@/shared/lib/utils'
import { formatAgo } from '@/shared/time/relative'
import { useNow } from '@/shared/time/useNow'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { ArrivalNotice } from './useArrivalNotices'

export interface NotificationsMenuProps {
  unreadCount?: number
  notices?: ArrivalNotice[]
  onDismissNotice?: (kind: ProviderKind) => void
  className?: string
}

export function NotificationsMenu({
  unreadCount = 0,
  notices = [],
  onDismissNotice,
  className,
}: NotificationsMenuProps) {
  const now = useNow()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)

  // Notices from background sync
  const noticeSum = notices.reduce((sum, n) => sum + n.count, 0)
  const totalCount = Math.max(unreadCount, noticeSum)

  // Query unread conversations across both kinds (CHAT and EMAIL) only when menu is open
  const { data: unreadData } = useQuery({
    queryKey: ['inbox', 'notifications-unread-list'],
    queryFn: () => fetchConversations({ view: 'unread', account: null }, null),
    enabled: open,
    staleTime: 3_000,
    refetchInterval: open ? 5_000 : false,
  })

  const unreadItems = unreadData?.items ?? []

  const handleMarkAllAsRead = async () => {
    if (marking) return
    setMarking(true)
    try {
      try {
        await markAllConversationsRead()
      } catch (err) {
        console.warn('markAllConversationsRead API fallback:', err)
        if (unreadItems.length > 0) {
          await Promise.allSettled(
            unreadItems.map((item) => updateConversation(item.id, { read: true }))
          )
        }
      }
      onDismissNotice?.('EMAIL')
      onDismissNotice?.('CHAT')
      queryClient.setQueryData(['inbox', 'notifications-unread-list'], { items: [], total: 0, nextCursor: null })
      await queryClient.invalidateQueries({ queryKey: ['inbox'] })
    } catch (err) {
      console.error('Failed to mark all conversations as read:', err)
    } finally {
      setMarking(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label={totalCount > 0 ? `Thông báo, ${totalCount} mới` : 'Thông báo'}
        >
          <Bell className="size-4.5" strokeWidth={1.6} />
          {totalCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-background"
            >
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-0 shadow-lg border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-surface/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Thông báo</span>
            {totalCount > 0 && (
              <Badge className="px-1.5 py-0 text-[11px] font-semibold">
                {totalCount}
              </Badge>
            )}
          </div>
          {totalCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={marking}
              className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              <span>{marking ? 'Đang xử lý...' : 'Đánh dấu đọc tất cả'}</span>
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Đã cập nhật</span>
          )}
        </div>

        {/* Realtime arrival notices (if any) */}
        {notices.length > 0 && (
          <div className="border-b bg-muted/40 divide-y divide-border/40">
            {notices.map(({ kind, count }) => {
              const text = newMailText(count, kind)
              return (
                <div key={kind} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="size-2 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none truncate text-foreground">{text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {kind === 'CHAT' ? 'Từ tin nhắn Zalo' : 'Từ hòm thư Gmail'}
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs px-2.5 font-medium shrink-0"
                    onClick={() => onDismissNotice?.(kind)}
                  >
                    <Link to={SCREENS[kind].path}>Xem</Link>
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Unread conversations list */}
        {unreadItems.length > 0 ? (
          <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
            {unreadItems.map((item) => {
              const to = item.kind === 'CHAT' ? `/messages/${item.id}` : `/inbox/${item.id}`
              const timeAgo = formatAgo(new Date(item.lastMessageAt), now)
              return (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="flex items-start gap-3 p-3.5 cursor-pointer hover:bg-muted/50 rounded-none h-auto"
                >
                  <Link to={to}>
                    <Avatar src={item.avatarUrl} className="size-9 shrink-0 mt-0.5">
                      {!item.avatarUrl && (
                        <span className="flex size-full items-center justify-center text-xs font-semibold text-foreground/80">
                          {item.title.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-sm font-semibold text-foreground truncate">{item.title}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                        {item.snippet || '(Không có nội dung tin nhắn)'}
                      </p>
                    </div>
                    {item.unreadCount > 1 && (
                      <span className="size-4.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {item.unreadCount > 9 ? '9+' : item.unreadCount}
                      </span>
                    )}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </div>
        ) : notices.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <CheckCheck className="mx-auto size-8 opacity-40 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground/80">Không có thông báo mới</p>
            <p className="text-xs text-muted-foreground mt-0.5">Hộp thư và tin nhắn của bạn đã được đọc hết</p>
          </div>
        ) : null}

        {/* Footer Quick Links */}
        <div className="border-t bg-muted/20 px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <Link
            to="/messages"
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <MessagesSquare className="size-3.5" />
            <span>Tin nhắn</span>
          </Link>
          <span className="h-3 w-px bg-border" />
          <Link
            to="/inbox"
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:text-foreground hover:bg-muted/50 transition-colors font-medium"
          >
            <Inbox className="size-3.5" />
            <span>Hộp thư</span>
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
