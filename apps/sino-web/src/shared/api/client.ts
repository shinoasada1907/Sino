import { ApiError, NETWORK_ERROR, toApiError } from './problem'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'

const sessionListeners = new Set<() => void>()

/**
 * Called when a request answers 401 outside `/api/auth/*`: the session ended while the app was open. The app layer
 * registers the reaction (clear the cache, go to sign-in); returns the function that unregisters it.
 */
export function onSessionExpired(listener: () => void): () => void {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

// Spring writes the token as it is (no URL encoding), and the header must carry exactly that value.
function readCookie(name: string): string | null {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.slice(name.length + 1) : null
}

/**
 * The one place that calls the API (D-36: same origin, the session cookie goes along). Changes carry the CSRF token
 * of the `XSRF-TOKEN` cookie; a stale token is renewed through `GET /api/auth/me` and the change is sent once more.
 * Every failure is an `ApiError`.
 */
async function request<T>(method: Method, path: string, body: unknown, signal: AbortSignal | undefined, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const change = method !== 'GET'
  if (change) {
    const token = readCookie(CSRF_COOKIE)
    if (token) {
      headers[CSRF_HEADER] = token
    }
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    // An absolute address: the browser would resolve "/api/…" by itself, the fetch of the test runner does not.
    response = await fetch(new URL(path, window.location.origin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }
    throw new ApiError(0, NETWORK_ERROR, null)
  }

  if (response.ok) {
    const type = response.headers.get('Content-Type') ?? ''
    return (response.status !== 204 && type.includes('json') ? await response.json() : undefined) as T
  }

  const error = await toApiError(response)
  if (change && !retried && error.status === 403 && error.code === 'CSRF_TOKEN_INVALID') {
    await renewCsrfToken()
    return request<T>(method, path, body, signal, true)
  }
  if (error.status === 401 && !path.startsWith('/api/auth/')) {
    sessionListeners.forEach((listener) => listener())
  }
  throw error
}

// Any answer of /me sets a fresh XSRF-TOKEN cookie, even 401 when nobody is signed in.
async function renewCsrfToken(): Promise<void> {
  try {
    await fetch(new URL('/api/auth/me', window.location.origin), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
  } catch {
    // The retry that follows reports the failure.
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body, undefined),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body, undefined),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body, undefined),
  delete: <T>(path: string) => request<T>('DELETE', path, undefined, undefined),
}
