/** Where the app opens when nothing else is asked for; `/` goes there too. */
export const HOME = '/overview'

/**
 * The page to open after signing in: only a path of this app. `//evil.example` starts with "/" but the browser reads
 * it as another site, some browsers read `/\evil.example` the same way, and the sign-in page itself would loop.
 */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return HOME
  }
  if (value === '/login' || value.startsWith('/login?')) {
    return HOME
  }
  return value
}
