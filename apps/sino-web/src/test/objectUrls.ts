// jsdom has no `URL.createObjectURL`. This stand-in gives each blob an address of its own and keeps the ones not revoked
// yet, so a test can tell that a preview was let go when its picture left (SP-08). Reset before each test (setup.ts).

const live = new Map<string, Blob>()
let next = 0

export function stubObjectUrls() {
  live.clear()
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    const url = `blob:sino-test/${next++}`
    live.set(url, blob as Blob)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    live.delete(url)
  }
}

/** The addresses made and not revoked yet. */
export const liveObjectUrls = () => [...live.keys()]
