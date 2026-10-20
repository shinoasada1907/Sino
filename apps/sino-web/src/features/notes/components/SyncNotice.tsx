import { Button } from '@/shared/ui/button'
import type { NoteKind } from '../notes.types'
import type { NoteSync } from '../useAutosave'

const BANNER = 'flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-sm border px-4 py-3 text-sm leading-5.5 text-foreground'
const WARNING = `${BANNER} border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface))]`
const DANGER = `${BANNER} border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))]`

/**
 * What the open note says about its saving (D-178), at the top of the editor: the note was saved from another place
 * ("Tải bản mới" / "Lưu bản của tôi"), it was deleted there ("Lưu thành ghi chú mới"), or the change could not be saved
 * ("Thử lại"); and a refused pin. The writing stays where it is in every case. `kind` words the first: what is not saved is
 * the text being typed, or what was drawn.
 */
export function SyncNotice({ sync, kind }: { sync: NoteSync; kind: NoteKind }) {
  return (
    <>
      {sync.problem === 'conflict' && (
        <div role="alert" className={WARNING}>
          <p className="min-w-0 flex-[1_1_240px]">
            Ghi chú này vừa được sửa ở nơi khác. {kind === 'DIAGRAM' ? 'Thay đổi bạn vừa vẽ chưa được lưu.' : 'Chữ bạn đang gõ chưa được lưu.'}
          </p>
          <span className="flex shrink-0 gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={sync.reload}>
              Tải bản mới
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={sync.keepMine}>
              Lưu bản của tôi
            </Button>
          </span>
        </div>
      )}
      {sync.problem === 'gone' && (
        <div role="alert" className={WARNING}>
          <p className="min-w-0 flex-[1_1_240px]">Ghi chú này đã bị xóa ở nơi khác.</p>
          <Button type="button" variant="primary" size="sm" className="shrink-0" onClick={sync.saveAsNew}>
            Lưu thành ghi chú mới
          </Button>
        </div>
      )}
      {sync.problem === 'failed' && (
        <div role="alert" className={DANGER}>
          <p className="min-w-0 flex-[1_1_240px]">Không lưu được thay đổi.</p>
          <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={sync.retry}>
            Thử lại
          </Button>
        </div>
      )}
      {sync.pinProblem && (
        <p role="alert" className="text-sm text-danger-ink">
          Không ghim được. Hãy thử lại.
        </p>
      )}
    </>
  )
}
