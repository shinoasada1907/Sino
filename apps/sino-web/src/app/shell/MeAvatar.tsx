import type { ComponentProps } from 'react'
import { useMe } from '@/features/auth/useAuth'
import { UserAvatar } from '@/shared/ui/user-avatar'

/** The signed-in owner's avatar: `me.avatarUrl`, or the first letter of the name; it changes when the picture is saved (PI-05). */
export function MeAvatar(props: Omit<ComponentProps<typeof UserAvatar>, 'name' | 'src'>) {
  const { data: me } = useMe()
  return <UserAvatar name={me?.displayName} src={me?.avatarUrl} {...props} />
}
