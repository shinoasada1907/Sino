import { Spec } from '@/shared/ui/spec'
import { mailTime } from '../format'
import type { ConversationItem } from '../inbox.types'

/**
 * In place of the messages until the API returns them (F06, D-71): the start of the newest message as the list has it,
 * and a line saying the whole conversation comes later. Nothing here pretends to be the full message.
 */
export function LatestPreview({ item, now }: { item: ConversationItem; now: Date }) {
  const what = item.kind === 'EMAIL' ? 'thư' : 'tin'
  const label = `${item.kind === 'EMAIL' ? 'Thư' : 'Tin'} mới nhất`

  return (
    <article aria-label={label} className="flex flex-col gap-3 rounded-md border bg-surface p-4 md:p-5">
      <Spec>{[label, item.snippetFrom, mailTime(item.lastMessageAt, now, undefined, true)].filter(Boolean).join(' · ')}</Spec>
      {item.snippet ? (
        <p className="max-w-155 text-base">{item.snippet}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{label} không có chữ.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Sino mới hiện đoạn đầu của {what} mới nhất. Đọc cả cuộc trò chuyện ngay trong Sino sẽ có ở bản sau.
      </p>
    </article>
  )
}
