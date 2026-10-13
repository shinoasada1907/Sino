// pnpm serve [--port 4321] [--dir dist]: serves the built site the way a static host would (404.html for unknown paths).
import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { resolveRequest } from '../src/static-files.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { port: { type: 'string', default: '4321' }, dir: { type: 'string' } } })
const root = values.dir ? resolve(values.dir) : resolve(packageRoot, 'dist')

createServer((request, response) => {
  const { file, status } = resolveRequest(root, request.url ?? '/')
  response.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file)
    .on('error', () => response.end())
    .pipe(response)
}).listen(Number(values.port), '127.0.0.1', () => {
  console.log(`Sino site: http://localhost:${values.port} (${root})`)
})
