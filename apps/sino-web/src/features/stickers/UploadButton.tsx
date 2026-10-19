import { Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/shared/ui/button'

/** What the picker of the browser is asked to show. It only tunes the picker; `checkStickerFile` is the fence. */
const ACCEPT = 'image/png,image/gif,image/webp'

/**
 * The hidden file input of the screen, one for all its upload buttons: `children` gets the function that opens the picker.
 * The input is cleared after each choice, so choosing the same file again still fires a change. Pictures only; several at once.
 */
export function FilePicker({ onFiles, children }: { onFiles: (files: File[]) => void; children: (open: () => void) => ReactNode }) {
  // In state, not in a ref: the render reads it to hand `open` out, and a ref must not be read while rendering.
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  return (
    <>
      {children(() => input?.click())}
      <input
        ref={setInput}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        aria-label="Chọn tệp sticker"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0) {
            onFiles(files)
          }
        }}
      />
    </>
  )
}

/** "Tải lên": the button with its icon and word, or (`iconOnly`, for the phone header) the icon with the word as its name. */
export function UploadButton({ onClick, iconOnly = false, variant = 'primary' }: { onClick: () => void; iconOnly?: boolean; variant?: 'primary' | 'secondary' }) {
  return iconOnly ? (
    <Button type="button" variant="ghost" size="icon" aria-label="Tải lên" onClick={onClick}>
      <Upload strokeWidth={1.6} />
    </Button>
  ) : (
    <Button type="button" variant={variant} size="sm" onClick={onClick}>
      <Upload strokeWidth={1.6} />
      Tải lên
    </Button>
  )
}
