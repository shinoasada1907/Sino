// A canvas for tests: vitest runs in jsdom, which has no 2D drawing. The context keeps the transform it is given (an
// affine matrix, as a real one does) and every `drawImage`, so a test can tell where each point of the picture lands on
// the canvas. `toBlob` gives a blob of `bytesFor(width, height)` bytes, to stand for how heavy the PNG would be.

/** An affine matrix `[a, b, c, d, e, f]`, as `DOMMatrix`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function multiply([a1, b1, c1, d1, e1, f1]: Matrix, [a2, b2, c2, d2, e2, f2]: Matrix): Matrix {
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1]
}

export interface Drawing {
  source: unknown
  /** The arguments after the source: `dx, dy`, `dx, dy, dw, dh` or `sx, sy, sw, sh, dx, dy, dw, dh`. */
  args: number[]
  matrix: Matrix
}

export class FakeContext {
  matrix: Matrix = IDENTITY
  drawings: Drawing[] = []
  imageSmoothingEnabled = false
  imageSmoothingQuality: 'low' | 'medium' | 'high' = 'low'

  translate(x: number, y: number) {
    this.matrix = multiply(this.matrix, [1, 0, 0, 1, x, y])
  }

  scale(x: number, y: number) {
    this.matrix = multiply(this.matrix, [x, 0, 0, y, 0, 0])
  }

  rotate(radians: number) {
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    this.matrix = multiply(this.matrix, [cos, sin, -sin, cos, 0, 0])
  }

  drawImage(source: unknown, ...args: number[]) {
    this.drawings.push({ source, args, matrix: this.matrix })
  }
}

export class FakeCanvas {
  width = 300
  height = 150
  readonly context = new FakeContext()
  readonly blobs: { width: number; height: number; type: string | undefined }[] = []
  private readonly bytesFor: (width: number, height: number) => number | null

  constructor(bytesFor: (width: number, height: number) => number | null = () => 1000) {
    this.bytesFor = bytesFor
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null
  }

  toBlob(callback: (blob: Blob | null) => void, type?: string) {
    this.blobs.push({ width: this.width, height: this.height, type })
    const bytes = this.bytesFor(this.width, this.height)
    queueMicrotask(() => callback(bytes === null ? null : new Blob([new Uint8Array(bytes)], { type: type ?? 'image/png' })))
  }
}

/** Where the point (x, y) of what was drawn lands on the canvas, for one drawing at (0, 0). */
export function landsAt(drawing: Drawing, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = drawing.matrix
  return [a * x + c * y + e, b * x + d * y + f]
}
