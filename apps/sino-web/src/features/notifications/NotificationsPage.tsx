import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Clock, Inbox, MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { fetchConversations, markAllConversationsRead, updateConversation } from '@/features/inbox/inbox.api'
import { newMailText } from '@/features/inbox/format'
import { SCREENS } from '@/features/inbox/screen'
import { formatAgo } from '@/shared/time/relative'
import { useNow } from '@/shared/time/useNow'
import { Avatar } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { useArrivalNotices } from '@/app/shell/useArrivalNotices'
import { MobilePageHeader } from '@/app/shell/MobilePageHeader'

export function NotificationsPage() {
  const now = useNow()
  const queryClient = useQueryClient()
  const { notices, dismiss } = useArrivalNotices()
  const [marking, setMarking] = useState(false)

  const { data: unreadData, isLoading } = useQuery({
    queryKey: ['inbox', 'notifications-page-list'],
    queryFn: () => fetchConversations({ view: 'unread', source: null, account: null }, null),
    staleTime: 3_000,
  })

  const unreadItems = unreadData?.items ?? []
  const noticeSum = notices.reduce((sum, n) => sum + n.count, 0)
  const totalCount = Math.max(unreadItems.length, noticeSum)

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
      dismiss('EMAIL')
      dismiss('CHAT')
      queryClient.setQueryData(['inbox', 'notifications-page-list'], { items: [], total: 0, nextCursor: null })
      queryClient.setQueryData(['inbox', 'notifications-unread-list'], { items: [], total: 0, nextCursor: null })
      await queryClient.invalidateQueries({ queryKey: ['inbox'] })
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <MobilePageHeader
        back={{ to: '/more', label: 'Quay lại Thêm' }}
        title="Thông báo"
        subtitle={totalCount > 0 ? `${totalCount} chưa đọc` : undefined}
      />

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bell className="size-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Thông báo</h1>
                {totalCount > 0 && (
                  <Badge className="px-2 py-0.5 text-xs font-semibold">
                    {totalCount}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Các tin nhắn, email và hoạt động cần bạn chú ý
              </p>
            </div>
          </div>

          {totalCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={marking}
              onClick={handleMarkAllAsRead}
              className="gap-1.5"
            >
              <CheckCheck className="size-4" />
              <span>{marking ? 'Đang xử lý...' : 'Đánh dấu đọc tất cả'}</span>
            </Button>
          )}
        </div>

        {/* Realtime arrival notices */}
        {notices.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {notices.map(({ kind, count }) => {
              const text = newMailText(count, kind)
              return (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-2.5 rounded-full bg-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{text}</p>
                      <p className="text-xs text-muted-foreground">
                        {kind === 'CHAT' ? 'Từ tin nhắn Zalo' : 'Từ hòm thư Gmail'}
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" onClick={() => dismiss(kind)}>
                    <Link to={SCREENS[kind].path}>Mở ngay</Link>
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Unread Conversations List */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Đang tải danh sách thông báo...
            </div>
          ) : unreadItems.length > 0 ? (
            <div className="divide-y divide-border/60">
              {unreadItems.map((item) => {
                const to = item.kind === 'CHAT' ? `/messages/${item.id}` : `/inbox/${item.id}`
                const timeAgo = formatAgo(new Date(item.lastMessageAt), now)
                return (
                  <Link
                    key={item.id}
                    to={to}
                    className="flex items-start gap-3.5 p-4 transition-colors hover:bg-hover/50"
                  >
                    <Avatar src={item.avatarUrl} className="size-10 shrink-0 mt-0.5">
                      {!item.avatarUrl && (
                        <span className="flex size-full items-center justify-center text-sm font-semibold text-foreground">
                          {item.title.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground truncate">{item.title}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <Clock className="size-3" />
                          {timeAgo}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {item.snippet || '(Không có nội dung tin nhắn)'}
                      </p>
                    </div>
                    {item.unreadCount > 1 && (
                      <span className="size-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {item.unreadCount > 9 ? '9+' : item.unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="py-14 text-center text-muted-foreground">
              <CheckCheck className="mx-auto size-10 opacity-30 mb-3" strokeWidth={1.5} />
              <p className="text-base font-semibold text-foreground/80">Không có thông báo mới</p>
              <p className="text-xs text-muted-foreground mt-1">Hộp thư và tin nhắn của bạn đã được đọc hết</p>
              <div className="mt-5 flex justify-center gap-3">
                <Button asChild variant="secondary" size="sm">
                  <Link to="/messages" className="gap-1.5">
                    <MessagesSquare className="size-4" />
                    <span>Tin nhắn</span>
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/inbox" className="gap-1.5">
                    <Inbox className="size-4" />
                    <span>Hộp thư</span>
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

