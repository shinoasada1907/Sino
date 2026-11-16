import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw/server'
import { formDataOf } from '@/test/nodeFile'
import { api, onSessionExpired } from './client'
import { ApiError } from './problem'

const problem = (status: number, body: Record<string, unknown>) =>
  HttpResponse.json({ title: 'Error', status, instance: '/api/x', ...body }, { status, headers: { 'Content-Type': 'application/problem+json' } })

function setCsrfCookie(value: string) {
  document.cookie = `XSRF-TOKEN=${value}; path=/`
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) {
      return error
    }
    throw error
  }
  throw new Error('expected the request to fail')
}

describe('API client', () => {
  beforeEach(() => setCsrfCookie('token-1'))
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('sends the CSRF token with a change and not with a read', async () => {
    const seen: { method: string; token: string | null; type: string | null; body: unknown }[] = []
    server.use(
      http.all('/api/accounts/acc-1', async ({ request }) => {
        seen.push({
          method: request.method,
          token: request.headers.get('X-XSRF-TOKEN'),
          type: request.headers.get('Content-Type'),
          body: request.method === 'GET' ? null : await request.json(),
        })
        return HttpResponse.json({ id: 'acc-1' })
      }),
    )

    expect(await api.get('/api/accounts/acc-1')).toEqual({ id: 'acc-1' })
    await api.patch('/api/accounts/acc-1', { syncEnabled: false })

    expect(seen).toEqual([
      { method: 'GET', token: null, type: null, body: null },
      { method: 'PATCH', token: 'token-1', type: 'application/json', body: { syncEnabled: false } },
    ])
  })

  it('returns nothing for 204 No Content', async () => {
    server.use(http.delete('/api/accounts/acc-1', () => new HttpResponse(null, { status: 204 })))

    expect(await api.delete('/api/accounts/acc-1')).toBeUndefined()
  })

  it('turns a Problem Details body into an ApiError with status, code, detail and the other members', async () => {
    server.use(
      http.get('/api/accounts/missing', () => problem(404, { code: 'ACCOUNT_NOT_FOUND', detail: 'Account not found' })),
      http.post('/api/auth/login', () => problem(401, { code: 'INVALID_CREDENTIALS', detail: 'Wrong email or password', remainingAttempts: 4 })),
      http.patch('/api/accounts/acc-1', () =>
        problem(400, { code: 'VALIDATION_FAILED', detail: 'Invalid request', errors: [{ field: 'displayName', message: 'too long' }] }),
      ),
    )

    const notFound = await caught(api.get('/api/accounts/missing'))
    expect(notFound).toMatchObject({ status: 404, code: 'ACCOUNT_NOT_FOUND', detail: 'Account not found', errors: [] })
    const login = await caught(api.post('/api/auth/login', { email: 'a@b.c', password: 'x' }))
    expect(login).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', extra: { remainingAttempts: 4 } })
    const invalid = await caught(api.patch('/api/accounts/acc-1', { displayName: 'x'.repeat(200) }))
    expect(invalid.errors).toEqual([{ field: 'displayName', message: 'too long' }])
  })

  it('names an answer that is not Problem Details by its status', async () => {
    server.use(http.get('/api/accounts', () => new HttpResponse('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))

    expect(await caught(api.get('/api/accounts'))).toMatchObject({ status: 502, code: 'HTTP_502', detail: null })
  })

  it('turns a network failure into NETWORK_ERROR', async () => {
    server.use(http.get('/api/accounts', () => HttpResponse.error()))

    expect(await caught(api.get('/api/accounts'))).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('gets a fresh CSRF token and tries a change once more when the token was stale', async () => {
    const calls: string[] = []
    server.use(
      http.patch('/api/accounts/acc-1', ({ request }) => {
        const token = request.headers.get('X-XSRF-TOKEN')
        calls.push(`PATCH ${token}`)
        return token === 'token-2' ? HttpResponse.json({ id: 'acc-1' }) : problem(403, { code: 'CSRF_TOKEN_INVALID' })
      }),
      http.get('/api/auth/me', () => {
        calls.push('GET me')
        setCsrfCookie('token-2')
        return problem(401, { code: 'UNAUTHORIZED' })
      }),
    )

    expect(await api.patch('/api/accounts/acc-1', { enabled: true })).toEqual({ id: 'acc-1' })
    expect(calls).toEqual(['PATCH token-1', 'GET me', 'PATCH token-2'])
  })

  it('gives up after one more try when the token is still refused', async () => {
    const calls: string[] = []
    server.use(
      http.patch('/api/accounts/acc-1', () => {
        calls.push('PATCH')
        return problem(403, { code: 'CSRF_TOKEN_INVALID' })
      }),
      http.get('/api/auth/me', () => {
        calls.push('GET me')
        return HttpResponse.json({ email: 'me@example.com', displayName: 'An' })
      }),
    )

    expect(await caught(api.patch('/api/accounts/acc-1', { enabled: true }))).toMatchObject({ status: 403, code: 'CSRF_TOKEN_INVALID' })
    expect(calls).toEqual(['PATCH', 'GET me', 'PATCH'])
  })

  it('tells the app when the session has ended, except for the sign-in requests themselves', async () => {
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    server.use(
      http.get('/api/accounts', () => problem(401, { code: 'UNAUTHORIZED' })),
      http.get('/api/auth/me', () => problem(401, { code: 'UNAUTHORIZED' })),
    )

    await caught(api.get('/api/auth/me'))
    expect(expired).not.toHaveBeenCalled()
    await caught(api.get('/api/accounts'))
    expect(expired).toHaveBeenCalledTimes(1)

    stop()
    await caught(api.get('/api/accounts'))
    expect(expired).toHaveBeenCalledTimes(1)
  })
})

// ST-10 (custom-stickers, D-337): a file goes up as multipart/form-data, which `post` cannot send (it writes JSON).
describe('API client uploads', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

  const formOf = (name?: string) => {
    const form = new FormData()
    form.append('file', new File([PNG], 'meo.png', { type: 'image/png' }))
    if (name !== undefined) {
      form.append('name', name)
    }
    return form
  }

  beforeEach(() => setCsrfCookie('token-1'))
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('sends the form as it is, with the CSRF token and a multipart type the browser makes up (no JSON type of ours)', async () => {
    let seen: { method: string; token: string | null; type: string | null; name: unknown; file: File } | undefined
    server.use(
      http.post('/api/stickers', async ({ request }) => {
        const form = await formDataOf(request)
        seen = {
          method: request.method,
          token: request.headers.get('X-XSRF-TOKEN'),
          type: request.headers.get('Content-Type'),
          name: form.get('name'),
          file: form.get('file') as File,
        }
        return HttpResponse.json({ id: 'st-1' }, { status: 201 })
      }),
    )

    expect(await api.upload('/api/stickers', formOf('meo'))).toEqual({ id: 'st-1' })

    expect(seen?.method).toBe('POST')
    expect(seen?.token).toBe('token-1')
    // The boundary after the type exists only if the browser wrote the header; one written by hand has none and breaks the body.
    expect(seen?.type).toMatch(/^multipart\/form-data; boundary=/)
    expect(seen?.name).toBe('meo')
    expect(seen?.file.type).toBe('image/png')
    expect(new Uint8Array(await seen!.file.arrayBuffer())).toEqual(PNG)
    // Not asserted: the file name. jsdom's File is not Node's, so the name does not survive the `fetch` of the test runner
    // (it arrives as "blob"); a browser sends it. The pages test the name in the form they hand to `api.upload`.
  })

  it('sends the same form again after a stale CSRF token, bytes included', async () => {
    const calls: string[] = []
    const files: number[] = []
    server.use(
      http.post('/api/stickers', async ({ request }) => {
        const token = request.headers.get('X-XSRF-TOKEN')
        calls.push(`POST ${token}`)
        files.push(((await formDataOf(request)).get('file') as File).size)
        return token === 'token-2' ? HttpResponse.json({ id: 'st-1' }, { status: 201 }) : problem(403, { code: 'CSRF_TOKEN_INVALID' })
      }),
      http.get('/api/auth/me', () => {
        calls.push('GET me')
        setCsrfCookie('token-2')
        return problem(401, { code: 'UNAUTHORIZED' })
      }),
    )

    expect(await api.upload('/api/stickers', formOf())).toEqual({ id: 'st-1' })

    expect(calls).toEqual(['POST token-1', 'GET me', 'POST token-2'])
    expect(files).toEqual([PNG.length, PNG.length])
  })

  it('turns a refusal of the server into an ApiError with its code, like every other call', async () => {
    server.use(http.post('/api/stickers', () => problem(413, { code: 'STICKER_TOO_LARGE', detail: 'Too large' })))

    expect(await caught(api.upload('/api/stickers', formOf()))).toMatchObject({ status: 413, code: 'STICKER_TOO_LARGE' })
  })

  it('turns a network failure into NETWORK_ERROR', async () => {
    server.use(http.post('/api/stickers', () => HttpResponse.error()))

    expect(await caught(api.upload('/api/stickers', formOf()))).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('tells the app when the session has ended', async () => {
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    server.use(http.post('/api/stickers', () => problem(401, { code: 'UNAUTHORIZED' })))

    await caught(api.upload('/api/stickers', formOf()))

    expect(expired).toHaveBeenCalledTimes(1)
    stop()
  })

  it('leaves the JSON calls as they were', async () => {
    let type: string | null = null
    server.use(
      http.post('/api/tasks', ({ request }) => {
        type = request.headers.get('Content-Type')
        return HttpResponse.json({ id: 't-1' })
      }),
    )

    await api.post('/api/tasks', { title: 'x' })

    expect(type).toBe('application/json')
  })
})
