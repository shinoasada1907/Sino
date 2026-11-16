import { RotateCw } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Segmented } from '@/shared/ui/segmented'
import { MAX_ZOOM, MIN_ZOOM, turnedQuarter, type FrameShape, type PictureEdit } from './pictureEdit'

const SHAPES: { value: FrameShape; label: string }[] = [
  { value: 'square', label: 'Vuông' },
  { value: 'picture', label: 'Theo ảnh' },
]

const TURNS: Record<PictureEdit['rotation'], string> = { 0: 'Không xoay', 90: 'Đã xoay 90°', 180: 'Đã xoay 180°', 270: 'Đã xoay 270°' }

/**
 * The controls of the frame of a still picture (SP-09): zoom from 1 to 3, a quarter turn clockwise, a square frame or the
 * shape of the picture. Each is a plain control with a name, so all of it works from the keyboard and a screen reader;
 * the frame itself takes the arrow keys (react-easy-crop).
 */
export function FrameControls({ edit, onEdit }: { edit: PictureEdit; onEdit: (change: Partial<PictureEdit>) => void }) {
  const zoom = useId()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <Label htmlFor={zoom} className="shrink-0">
          Phóng to
        </Label>
        <input
          id={zoom}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.1}
          value={edit.zoom}
          aria-valuetext={`${String(Math.round(edit.zoom * 10) / 10).replace('.', ',')} lần`}
          onChange={(event) => onEdit({ zoom: Number(event.target.value) })}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-foreground"
        />
      </div>
      <div className="flex items-center gap-2">
        {/* A turn moves the picture under the frame back to the middle, where it is sure to fill the frame. */}
        <Button type="button" variant="secondary" size="sm" onClick={() => onEdit({ rotation: turnedQuarter(edit.rotation), crop: { x: 0, y: 0 }, area: null })} className="max-md:h-11">
          <RotateCw strokeWidth={1.6} />
          Xoay 90°
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {TURNS[edit.rotation]}
        </span>
      </div>
      <Segmented label="Hình khung" value={edit.shape} options={SHAPES} onChange={(shape) => onEdit({ shape, crop: { x: 0, y: 0 }, zoom: MIN_ZOOM, area: null })} />
    </div>
  )
}

/** The name of the sticker, for every picture; the server trims it, keeps 50 characters and falls back on the file name. */
export function NameField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const field = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field}>Tên sticker</Label>
      <Input id={field} value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
