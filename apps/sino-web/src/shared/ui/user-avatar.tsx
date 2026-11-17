import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { Avatar } from './avatar'

/** The first letter of a name, upper case; empty for a blank name. */
const initialOf = (name: string | null | undefined) => (name ?? '').trim().slice(0, 1).toLocaleUpperCase('vi')

/**
 * The avatar of a person of Sino: the picture when there is one, the first letter of the name under it otherwise
 * (profile-info PI-05, "Xóa ảnh" falls back to it). The letter scales with the circle (container query units).
 */
export function UserAvatar({ name, src, className, ...props }: ComponentProps<typeof Avatar> & { name?: string | null }) {
  return (
    <Avatar
      src={src}
      fallback={
        <span aria-hidden="true" className="text-[42cqw] leading-none">
          {initialOf(name)}
        </span>
      }
      className={cn('grid place-items-center [container-type:size]', className)}
      {...props}
    />
  )
}
