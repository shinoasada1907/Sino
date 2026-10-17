import { vi } from 'vitest'

const ORIGINAL = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
}

/**
 * What React Flow needs of a browser and jsdom lacks (fe-ui-diagram-notes): an element size, a ResizeObserver that
 * reports at once, and DOMMatrixReadOnly for the zoom. Without sizes React Flow keeps every block hidden and draws no
 * link. The canvas is 1000 × 600 and a block 160 × 48; dragging and connecting are checked in Chrome.
 * Call in `beforeEach` (the stubbed globals are undone after each test) and `restoreReactFlow` in `afterAll`.
 */
export function stubReactFlow() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe(target: HTMLElement) {
        const contentRect = { width: target.offsetWidth, height: target.offsetHeight }
        this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22: number
      constructor(transform?: string) {
        this.m22 = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1)
      }
    },
  )
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: sizeOf('width') },
    offsetHeight: { configurable: true, get: sizeOf('height') },
  })
}

export function restoreReactFlow() {
  for (const [name, descriptor] of Object.entries(ORIGINAL)) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor)
    }
  }
}

const SIZES = { 'react-flow': { width: 1000, height: 600 }, 'react-flow__node': { width: 160, height: 48 } }

function sizeOf(side: 'width' | 'height') {
  return function (this: HTMLElement) {
    const known = Object.entries(SIZES).find(([name]) => this.classList.contains(name))
    return known ? known[1][side] : Number.parseFloat(this.style[side]) || 1
  }
}
