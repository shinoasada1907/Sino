// The app is compiled with the browser's types only (no @types/node). The tests need one thing of Node's `buffer`: its `File`
// class (nodeFile.ts), typed as the DOM's `File` since that is how they use it.
declare module 'node:buffer' {
  export const File: typeof globalThis.File
}
