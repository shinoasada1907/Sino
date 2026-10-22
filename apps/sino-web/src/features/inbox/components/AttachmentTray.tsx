import { FileText, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { formatFileSize } from '../format'
import type { AttachmentTray } from '../useAttachmentTray'

/** The row of the tray above the text box: a picture shows small, a file by its name and size; each can be taken out. */
export function AttachmentTrayView({ tray }: { tray: AttachmentTray }) {
  if (tray.items.length === 0 && tray.refusals.length === 0) {
    return null
  }
  return (
    <div className="order-first flex w-full flex-col gap-2 md:order-none">
      {tray.items.length > 0 && (
        <ul aria-label="Tệp sẽ gửi" className="flex gap-2 overflow-x-auto pt-1 pb-1">
          {tray.items.map(({ id, file, preview }) => (
            <li key={id} className="relative shrink-0">
              {preview ? (
                <img src={preview} alt={file.name} className="size-14 rounded-md border object-cover" />
              ) : (
                <div className="flex h-14 max-w-48 items-center gap-2 rounded-md border bg-surface pr-8 pl-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                  </span>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                aria-label={`Bỏ ${file.name}`}
                title={`Bỏ ${file.name}`}
                onClick={() => tray.remove(id)}
                className="absolute -top-1 -right-1 size-6 rounded-full"
              >
                <X strokeWidth={1.6} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {tray.refusals.length > 0 && (
        <div role="alert" className="flex flex-col gap-0.5 text-xs leading-4 text-danger-ink">
          {tray.refusals.map((refusal) => (
            <p key={refusal}>{refusal}</p>
          ))}
        </div>
      )}
    </div>
  )
}
