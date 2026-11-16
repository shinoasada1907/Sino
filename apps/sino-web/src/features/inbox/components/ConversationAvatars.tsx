import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/avatar'
import { memberPlaceholder } from '../format'
import type { ConversationItem, Member } from '../inbox.types'

/**
 * Canvas `.av-stack`: up to three members of a group, overlapping, or the one person of a chat. A group with a picture
 * of its own shows that one in a single circle (zalo-avatars, DN-1 = A). Decorative.
 */
export function ConversationAvatars({ item, members }: { item: ConversationItem; members: Member[] | null }) {
  const stacked = item.memberCount !== null && !item.avatarUrl && members !== null
  const people = stacked ? members.slice(0, 3) : [{ name: item.title, avatarUrl: item.avatarUrl }]
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {people.map((member, index) => (
        <Avatar
          key={member.name}
          src={member.avatarUrl}
          placeholder={memberPlaceholder(member.name, members)}
          className={cn('size-7 shadow-[0_0_0_2px_var(--bg)]', index > 0 && '-ml-2')}
        />
      ))}
    </span>
  )
}
