import { File as NodeFile } from 'node:buffer'

// jsdom replaces the global `File`, but `fetch` is Node's (undici) and mixes the two: it recognises a file by Node's
// `File` (fixed when undici loaded) and makes a new one with whatever global `File` is there when it runs. Under jsdom that
// is jsdom's, so a multipart body loses its file on the way out (empty, named "blob") and `request.formData()` fails with
// ERR_ASSERTION on the way in (ST-21). Both run with Node's `File` in the global, only for as long as undici needs it.

function swapInNodeFile() {
  const jsdomFile = globalThis.File
  globalThis.File = NodeFile
  return () => {
    globalThis.File = jsdomFile
  }
}

/** Reads the form of a request in a handler, as `request.formData()` does in a browser or in Node. */
export async function formDataOf(request: Request): Promise<FormData> {
  const restore = swapInNodeFile()
  try {
    return await request.formData()
  } finally {
    restore()
  }
}

/**
 * Makes the `fetch` in place (MSW's, so call it after `server.listen()`) put a jsdom `FormData` on the wire whole. The
 * request is built in the part of `fetch` that runs before its first wait, so the swap is over before any other code runs.
 */
export function sendFormsWhole() {
  const mswFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const restore = swapInNodeFile()
    try {
      return mswFetch(input, init)
    } finally {
      restore()
    }
  }
}
