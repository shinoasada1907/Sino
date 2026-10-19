import { useRef, useState, type DragEvent, type ReactNode } from 'react'

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')

/**
 * The whole screen as a place to drop pictures: while files are dragged over it a dashed frame says where to drop, and a
 * drop hands the files over (`onFiles`). A drag of text or of a link is left to the browser. It is a convenience only: the
 * upload button does the same, so nobody needs a mouse to add a sticker.
 */
export function DropZone({ label, onFiles, children }: { label: string; onFiles: (files: File[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false)
  // `dragenter` and `dragleave` also fire for every element the pointer crosses inside; counting them tells when it really left.
  const depth = useRef(0)

  return (
    <section
      aria-label={label}
      className="relative h-full min-h-0"
      onDragEnter={(event) => {
        if (carriesFiles(event)) {
          depth.current += 1
          setOver(true)
        }
      }}
      onDragOver={(event) => {
        if (carriesFiles(event)) {
          // Without this the browser refuses the drop.
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={(event) => {
        if (carriesFiles(event)) {
          depth.current = Math.max(0, depth.current - 1)
          setOver(depth.current > 0)
        }
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) {
          return
        }
        event.preventDefault()
        depth.current = 0
        setOver(false)
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) {
          onFiles(files)
        }
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-auto">{children}</div>
      {over && (
        <div
          data-slot="drop-overlay"
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-foreground/50 bg-background/85 px-6 text-center text-base font-semibold"
        >
          Thả ảnh PNG, GIF hoặc WebP để tải lên
        </div>
      )}
    </section>
  )
}
