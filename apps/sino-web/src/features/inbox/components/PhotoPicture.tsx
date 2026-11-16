import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { copyImageToClipboard } from '../clipboard'

// A Zalo photo in a chat (ZL-16): the picture in the slot of the canvas `.photo` (rounded 14px, a 1px border, 280 px wide
// at most, 220 px on a phone), keeping the shape the photo has, and a click opens it whole in a new tab. The other tab
// is given neither this page (`noopener`) nor its address (`noreferrer`), like the picture itself (`no-referrer`).
export function PhotoPicture({ src, onError }: { src: string; onError: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const success = await copyImageToClipboard(src)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="group/photo relative inline-block rounded-[14px] overflow-hidden">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-[14px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <img
          src={src}
          alt="Ảnh"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={onError}
          className="block h-auto max-h-80 min-h-20 w-auto max-w-55 min-w-20 rounded-[14px] border bg-surface object-cover md:max-w-70"
        />
      </a>

      {/* Hover action toolbar for copy & open */}
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/80 p-1 backdrop-blur-sm opacity-0 group-hover/photo:opacity-100 transition-opacity shadow-xs">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-foreground hover:bg-hover cursor-pointer transition-colors"
          title="Sao chép ảnh"
          aria-label="Sao chép ảnh"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-500" strokeWidth={2} />
              <span className="text-emerald-500 font-semibold">Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5 text-muted-foreground" strokeWidth={1.6} />
              <span>Sao chép</span>
            </>
          )}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
          title="Mở trong tab mới"
          aria-label="Mở trong tab mới"
        >
          <ExternalLink className="size-3.5" strokeWidth={1.6} />
        </a>
      </div>
    </div>
  )
}
