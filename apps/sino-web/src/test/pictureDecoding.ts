import { vi } from 'vitest'
import { FakeContext } from './fakeCanvas'

// jsdom decodes no picture and draws on no canvas. For the tests of the "Thêm sticker" step (SP-08): every picture
// decodes to `size` (or fails for the files `unreadable` names), a canvas draws nothing, and its PNG is a few bytes.
// Applied in the test that needs it; `restoreMocks` and `unstubGlobals` undo it after each test.

export const FAKE_PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]

export function stubPictureDecoding({ size = { width: 256, height: 256 }, unreadable = () => false }: { size?: { width: number; height: number }; unreadable?: (file: File) => boolean } = {}) {
  const decoded: File[] = []
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (file: File) => {
      if (unreadable(file)) {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      }
      decoded.push(file)
      return { ...size, close: () => {} }
    }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new FakeContext() as unknown as RenderingContext)
  // The size of each PNG made, as the canvas was when asked for it.
  const exported: { width: number; height: number }[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
    exported.push({ width: this.width, height: this.height })
    queueMicrotask(() => callback(new Blob([new Uint8Array(FAKE_PNG_BYTES)], { type: type ?? 'image/png' })))
  })
  return { decoded, exported }
}
