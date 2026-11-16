import { ImagePlus, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/shared/ui/button'
import type { BatchItem } from './useBatch'

/** What a picture says under it during a save; a failed one says why instead. */
const STATES: Partial<Record<BatchItem['status'], string>> = { waiting: 'Đang chờ', sending: 'Đang gửi…' }

/** Where the focus goes after a picture is taken out: the remove button of a picture, or "Thêm ảnh". */
export type BatchFocus = { removeOf: number } | 'add' | null

/**
 * The pictures of the batch (SP-08): a small picture and the file name of each, the selected one marked
 * (`aria-current`), a button to take each out, and "Thêm ảnh" last. During a save each says whether it waits or is being
 * sent, and one that failed says why (SP-10). Below 768 px it is a strip that scrolls sideways above
 * the picture shown; from 768 px a column beside it. Taking a picture out removes its buttons, so the step asks for the
 * focus to go to the next one (`focus`), and hears when it has (`onFocused`).
 */
export function BatchList({
  items,
  selectedId,
  disabled,
  onSelect,
  onRemove,
  onAdd,
  focus,
  onFocused,
}: {
  items: BatchItem[]
  selectedId: number | null
  disabled: boolean
  onSelect: (id: number) => void
  onRemove: (id: number) => void
  onAdd: () => void
  focus: BatchFocus
  onFocused: () => void
}) {
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focus === null) {
      return
    }
    const selector = focus === 'add' ? '[data-batch-add]' : `[data-batch-remove="${focus.removeOf}"]`
    list.current?.querySelector<HTMLElement>(selector)?.focus()
    onFocused()
  }, [focus, onFocused])

  return (
    <div ref={list} className="flex min-h-0 gap-2 max-md:overflow-x-auto max-md:pb-1 md:w-64 md:shrink-0 md:flex-col md:overflow-y-auto">
      {/* `role="list"`: Safari drops the list semantics of a list with `list-style: none`. */}
      <ul role="list" aria-label="Ảnh trong lượt" className="flex list-none gap-2 md:flex-col">
        {items.map((item) => (
          <li
            key={item.id}
            className="relative flex shrink-0 flex-wrap items-center gap-x-1 rounded-lg border bg-surface pr-1 has-aria-[current=true]:border-foreground max-md:w-44"
          >
            <button
              type="button"
              aria-current={item.id === selectedId ? 'true' : undefined}
              disabled={disabled}
              onClick={() => onSelect(item.id)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-raised">
                <img src={item.previewUrl} alt="" className="size-full object-contain" />
              </span>
              <span className="min-w-0 truncate text-sm font-medium">{item.file.name}</span>
            </button>
            {item.kind.editing === 'whole' && (
              <span aria-hidden="true" className="absolute top-0.5 left-0.5 rounded-xs border bg-surface px-1 font-mono text-[9px] leading-3.5 font-medium text-muted-foreground">
                Động
              </span>
            )}
            {item.status === 'failed' && <TriangleAlert role="img" aria-label="Có lỗi" className="size-4 shrink-0 text-danger" strokeWidth={1.6} />}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Bỏ ${item.file.name} khỏi lượt`}
              data-batch-remove={item.id}
              disabled={disabled}
              onClick={() => onRemove(item.id)}
              className="max-md:size-11"
            >
              <X strokeWidth={1.6} />
            </Button>
            {item.status !== 'idle' && (
              <p className={`w-full px-2 pb-1.5 text-xs leading-4 ${item.status === 'failed' ? 'text-danger-ink' : 'text-muted-foreground'}`}>{STATES[item.status] ?? item.problem}</p>
            )}
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" size="sm" data-batch-add="" disabled={disabled} onClick={onAdd} className="shrink-0 max-md:h-11 max-md:self-center">
        <ImagePlus strokeWidth={1.6} />
        Thêm ảnh
      </Button>
    </div>
  )
}
