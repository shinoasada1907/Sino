import { vi } from 'vitest'

type Listener = (event: Event) => void

/**
 * jsdom has no EventSource. This stand-in records the streams the app opens and lets a test play the server: `open()`,
 * `emit(type, data)` for an event, `drop()` for a lost connection the browser will retry, `fail()` for one it gives up.
 */
export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly url: string
  readonly withCredentials = false
  readyState = FakeEventSource.CONNECTING
  private readonly listeners = new Map<string, Set<Listener>>()

  constructor(url: string | URL) {
    this.url = String(url)
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.readyState = FakeEventSource.CLOSED
  }

  open() {
    this.readyState = FakeEventSource.OPEN
    this.dispatch(new Event('open'))
  }

  emit(type: string, data: object) {
    this.dispatch(new MessageEvent(type, { data: JSON.stringify(data) }))
  }

  drop() {
    this.readyState = FakeEventSource.CONNECTING
    this.dispatch(new Event('error'))
  }

  fail() {
    this.readyState = FakeEventSource.CLOSED
    this.dispatch(new Event('error'))
  }

  private dispatch(event: Event) {
    if (this.readyState === FakeEventSource.CLOSED && event.type !== 'error') {
      return
    }
    this.listeners.get(event.type)?.forEach((listener) => listener(event))
  }
}

/** Installs the stand-in for one test (`unstubGlobals` removes it after the test). */
export function stubEventSource() {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

/** The stream the app opened last. */
export function lastStream(): FakeEventSource {
  const stream = FakeEventSource.instances.at(-1)
  if (!stream) {
    throw new Error('The app opened no event stream')
  }
  return stream
}
