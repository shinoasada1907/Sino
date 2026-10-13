import { statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/**
 * The file a static host would answer a URL with: "/privacy" and "/privacy/" from privacy/index.html, a file by its
 * own name, and 404.html for anything else, including paths that try to leave the folder.
 */
export function resolveRequest(root: string, url: string): { file: string; status: number } {
  const base = resolve(root)
  const notFound = { file: join(base, '404.html'), status: 404 }
  let path: string
  try {
    path = decodeURIComponent(url.split(/[?#]/)[0])
  } catch {
    return notFound
  }

  const target = resolve(base, `.${path}`)
  if (target !== base && !target.startsWith(base + sep)) return notFound

  for (const candidate of [target, join(target, 'index.html')]) {
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      return { file: candidate, status: 200 }
    }
  }
  return notFound
}
