import { Pin } from 'lucide-react'
import { Button } from '@/shared/ui/button'

/** Ghim: a toggle that keeps its name and says its state (`aria-pressed`). */
export function PinButton({ pinned, disabled, onClick, size }: { pinned: boolean; disabled: boolean; onClick: () => void; size: 'icon' | 'icon-sm' }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label="Ghim"
      aria-pressed={pinned}
      disabled={disabled}
      onClick={onClick}
      className="aria-pressed:bg-raised aria-pressed:text-foreground"
    >
      <Pin strokeWidth={1.6} />
    </Button>
  )
}
