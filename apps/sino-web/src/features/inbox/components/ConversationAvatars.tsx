import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { memberPlaceholder } from '../format'
import type { ConversationItem, Member } from '../inbox.types'

/** Canvas `.av-stack`: up to three members of a group, overlapping, or the one person of a chat. Decorative. */
export function ConversationAvatars({ item, members }: { item: ConversationItem; members: Member[] | null }) {
  const people = item.memberCount !== null && members ? members.slice(0, 3) : [{ name: item.title }]
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {people.map((member, index) => (
        <Avatar
          key={member.name}
          placeholder={memberPlaceholder(member.name, members)}
          className={cn('size-7 shadow-[0_0_0_2px_var(--bg)]', index > 0 && '-ml-2')}
        />
      ))}
    </span>
  )
}
