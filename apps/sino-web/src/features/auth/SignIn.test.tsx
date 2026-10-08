import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

const ME = { email: 'an.nguyen@gmail.com', displayName: 'An Nguyễn' }

const problem = (status: number, body: Record<string, unknown>) =>
  HttpResponse.json({ title: 'Error', status, ...body }, { status, headers: { 'Content-Type': 'application/problem+json' } })

const form = () => within(screen.getByRole('form', { name: 'Đăng nhập vào Sino' }))

async function signIn(email: string, password: string) {
  const user = userEvent.setup()
  await user.clear(form().getByLabelText('Email'))
  await user.type(form().getByLabelText('Email'), email)
  await user.type(form().getByLabelText('Mật khẩu'), password)
  await user.click(form().getByRole('button', { name: 'Đăng nhập' }))
  return user
}

describe('signing in', () => {
  it('sends a signed-out visitor to the sign-in page, and back to the page they asked for afterwards', async () => {
    let signedIn = false
    let sent: unknown = null
    server.use(
      http.get('/api/auth/me', () => (signedIn ? HttpResponse.json(ME) : problem(401, { code: 'UNAUTHORIZED' }))),
      http.post('/api/auth/login', async ({ request }) => {
        sent = await request.json()
        signedIn = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = renderApp('/accounts', { me: 'request' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?returnTo=%2Faccounts')

    await signIn('an.nguyen@gmail.com', 'mat-khau-dung')

    expect(await screen.findAllByRole('heading', { level: 1, name: 'Tài khoản' })).not.toHaveLength(0)
    expect(router.state.location.pathname).toBe('/accounts')
    expect(sent).toEqual({ email: 'an.nguyen@gmail.com', password: 'mat-khau-dung', rememberMe: true })
  })

  it('remembers the whole address asked for, query included', async () => {
    server.use(http.get('/api/auth/me', () => problem(401, { code: 'UNAUTHORIZED' })))
    const { router } = renderApp('/inbox?view=unread', { me: 'request' })

    await screen.findByRole('heading', { level: 1, name: 'Đăng nhập vào Sino' })
    expect(router.state.location.search).toBe('?returnTo=%2Finbox%3Fview%3Dunread')
  })

  it('never leaves the app after signing in, whatever returnTo says', async () => {
    let signedIn = false
    server.use(
      http.get('/api/auth/me', () => (signedIn ? HttpResponse.json(ME) : problem(401, { code: 'UNAUTHORIZED' }))),
      http.post('/api/auth/login', () => {
        signedIn = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = renderApp('/login?returnTo=//evil.example', { me: null })

    await signIn('an.nguyen@gmail.com', 'mat-khau-dung')

    await waitFor(() => expect(router.state.location.pathname).toBe('/overview'))
    expect(screen.queryByRole('form', { name: 'Đăng nhập vào Sino' })).toBeNull()
  })

  it('says how many tries are left after a wrong password, empties the password and keeps the email', async () => {
    server.use(http.post('/api/auth/login', () => problem(401, { code: 'INVALID_CREDENTIALS', remainingAttempts: 4 })))
    renderApp('/login', { me: null })

    await signIn('an.nguyen@gmail.com', 'sai-mat-khau')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng')
    expect(alert).toHaveTextContent('Còn 4 lần thử trước khi phải đợi 15 phút.')
    expect(form().getByLabelText('Mật khẩu')).toHaveValue('')
    expect(form().getByLabelText('Mật khẩu')).toHaveAttribute('aria-invalid', 'true')
    expect(form().getByLabelText('Mật khẩu')).toHaveFocus()
    expect(form().getByLabelText('Email')).toHaveValue('an.nguyen@gmail.com')
  })

  it('says how long to wait when signing in is locked', async () => {
    server.use(http.post('/api/auth/login', () => problem(429, { code: 'LOGIN_LOCKED', retryAfterSeconds: 900 })))
    renderApp('/login', { me: null })

    await signIn('an.nguyen@gmail.com', 'sai-mat-khau')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tạm khóa đăng nhập')
    expect(alert).toHaveTextContent('Thử lại sau 15 phút.')
  })

  it('says so when the server cannot be reached', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.error()))
    renderApp('/login', { me: null })

    await signIn('an.nguyen@gmail.com', 'mat-khau')

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ Sino')
    expect(form().getByLabelText('Email')).toHaveValue('an.nguyen@gmail.com')
  })

  it('shows and hides the password, and keeps the parts of the canvas that have no flow yet out', async () => {
    renderApp('/login', { me: null })
    const user = userEvent.setup()
    const password = form().getByLabelText('Mật khẩu')

    expect(password).toHaveAttribute('type', 'password')
    await user.click(form().getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(form().getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password).toHaveAttribute('type', 'password')

    expect(form().getByRole('switch', { name: 'Giữ đăng nhập trên máy này' })).toBeChecked()
    for (const name of [/Google/, /Quên mật khẩu/, /Bắt đầu tại đây/, /Điều khoản/, /Ngôn ngữ/, /Trang chủ/]) {
      expect(screen.queryByRole('link', { name })).toBeNull()
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('takes someone already signed in straight to where they were going', async () => {
    const { router } = renderApp('/login?returnTo=%2Finbox', { me: ME })

    expect(await screen.findByRole('region', { name: 'Danh sách cuộc trò chuyện' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/inbox')
  })

  it('waits for the sign-in check, and offers to try again when the server cannot be reached', async () => {
    let attempts = 0
    server.use(
      http.get('/api/auth/me', () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(ME)
      }),
    )
    renderApp('/accounts', { me: 'request' })
    const user = userEvent.setup()

    expect(screen.getByRole('status', { name: 'Đang kiểm tra đăng nhập' })).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không kết nối được máy chủ Sino')

    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findAllByRole('heading', { level: 1, name: 'Tài khoản' })).not.toHaveLength(0)
  })
})
