import { Button } from '@/shared/ui/button'
import type { Refusal } from './useBatch'

/**
 * The files of the last choice that did not go into the batch, each with its name and why (SP-08). In the step while it is
 * open; on the screen when no file of the choice went in, with a way to hide it (`onDismiss`).
 */
export function BatchRefusals({ refusals, onDismiss }: { refusals: Refusal[]; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] px-3.5 py-3 text-sm">
      <ul className="flex flex-col gap-1">
        {refusals.map((refusal) => (
          <li key={refusal.key}>
            <span className="font-semibold">{refusal.fileName}</span>: {refusal.reason}
          </li>
        ))}
      </ul>
      {onDismiss && (
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Ẩn thông báo
        </Button>
      )}
    </div>
  )
}
