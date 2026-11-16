import type { CSSProperties } from 'react'
import type { StickerSprite } from '../inbox.types'

// A Zalo sticker that moves is a sprite sheet: its frames side by side in one row, each as wide as the sheet is tall
// (ZL-15). The sheet is `frames` times the box that shows one frame, and `animate-sticker` slides it left in `frames`
// steps once per `--sticker-ms`, on repeat. A reader who asked for less motion keeps the first frame.
// The still picture is a plain image: the fallback when the sticker does not move or its sheet cannot load.
export function StickerPicture({
  still,
  sprite,
  onSpriteError,
  onStillError,
}: {
  still: string | null
  sprite: StickerSprite | null
  onSpriteError: () => void
  onStillError: () => void
}) {
  if (sprite) {
    const style = { width: `${sprite.frames * 100}%`, '--sticker-frames': sprite.frames, '--sticker-ms': `${sprite.durationMs}ms` } as CSSProperties
    return (
      <div className="size-32 overflow-hidden select-none">
        <img
          src={sprite.url}
          alt="Sticker"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={onSpriteError}
          style={style}
          className="animate-sticker h-32 max-w-none motion-reduce:animate-none"
        />
      </div>
    )
  }
  return (
    <img src={still ?? undefined} alt="Sticker" loading="lazy" referrerPolicy="no-referrer" onError={onStillError} className="size-32 object-contain select-none" />
  )
}
