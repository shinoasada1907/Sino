import { ExternalLink } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { MessageLocation } from '../inbox.types'

/**
 * Location card inside a chat bubble (zalo-location-card, DN-1 = C, D-531): embedded Google Map with a "Maps" button
 * at the top-left corner opening Google Maps in a new tab, and the place title + address below. Colours follow the
 * Sino Sunset theme; if the map iframe fails to load, the title, address and "Maps" link stay usable.
 */
export function LocationCard({ location, own }: { location: MessageLocation; own: boolean }) {
  const coords = `${location.latitude},${location.longitude}`
  const embedUrl = `https://maps.google.com/maps?q=${coords}&z=16&output=embed`
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${coords}`
  const title = location.title?.trim() || (location.current ? 'Vị trí hiện tại' : 'Vị trí')
  const address = location.address?.trim() || null

  return (
    <div
      data-slot="location-card"
      className={cn(
        'flex w-72 max-w-full flex-col overflow-hidden rounded-[20px] p-2 transition-colors',
        own
          ? 'rounded-br-[8px] bg-primary text-primary-foreground'
          : 'rounded-bl-[8px] bg-raised text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] bg-surface/80">
        <iframe
          src={embedUrl}
          title={`Bản đồ: ${title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full border-0"
        />
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface/95 px-2.5 py-1 text-xs leading-4 font-semibold text-foreground shadow-sm backdrop-blur-xs transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Maps
          <ExternalLink className="size-3.5" strokeWidth={1.8} />
        </a>
      </div>

      <div className="flex flex-col gap-0.5 px-1.5 pt-2 pb-0.5 text-left">
        <span className="text-[13px] leading-snug font-semibold break-words">{title}</span>
        {address && (
          <span className={cn('text-xs leading-relaxed break-words', own ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
            {address}
          </span>
        )}
      </div>
    </div>
  )
}
