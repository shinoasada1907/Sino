import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { PROFILE, profileBackend, profileHandlers, resetProfileBackend } from '@/test/fixtures/profileApi'
import { stubViewport } from '@/test/matchMedia'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/renderApp'

// profile-info PI-04: the Thông tin cá nhân block on the profile API (spec user-profile-screen, D-478, D-479, D-480).
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Lưu thay đổi' })
const SAVED = 'Đã lưu thay đổi thông tin cá nhân thành công!'
const problem = (status: number, code: string) => HttpResponse.json({ status, code }, { status, headers: { 'Content-Type': 'application/problem+json' } })

/** Opens /profile at 1440 px; resolves once the saved profile is in the form. */
async function open() {
  stubViewport(1440)
  const view = renderApp('/profile')
  await waitFor(() => expect(field('Họ và tên')).toHaveValue(PROFILE.displayName))
  return view
}

describe('the profile screen on the profile API', () => {
  beforeEach(() => {
    resetProfileBackend()
    server.use(...profileHandlers)
  })

  it('shows what the server has; email is read-only and nothing to save yet', async () => {
    resetProfileBackend({ ...PROFILE, location: 'Hà Nội', bio: 'Dòng 1\nDòng 2' })
    await open()

    expect(field('Số điện thoại')).toHaveValue('+84 912 345 678')
    expect(field('Chức danh / Vai trò')).toHaveValue('Chủ cửa hàng')
    expect(field('Địa điểm làm việc')).toHaveValue('Hà Nội')
    expect(field('Giới thiệu ngắn (Bio)')).toHaveValue('Dòng 1\nDòng 2')
    expect(field('Địa chỉ Email')).toBeDisabled()
    expect(save()).toBeDisabled()
  })

  it('sends only the fields that changed, then shows the new name at once in the header and the me cache', async () => {
    const { queryClient } = await open()
    const user = userEvent.setup()

    await user.clear(field('Họ và tên'))
    await user.type(field('Họ và tên'), 'Bình Trần')
    await user.click(save())

    await screen.findByText(SAVED)
    expect(profileBackend.patches()).toEqual([{ displayName: 'Bình Trần' }])
    expect(screen.getByRole('heading', { level: 2, name: 'Bình Trần' })).toBeInTheDocument()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toMatchObject({ displayName: 'Bình Trần' })
    expect(save()).toBeDisabled()
  })

  it('clears an optional field with an empty value and keeps the others', async () => {
    await open()
    const user = userEvent.setup()

    await user.clear(field('Chức danh / Vai trò'))
    await user.click(save())

    await screen.findByText(SAVED)
    expect(profileBackend.patches()).toEqual([{ jobTitle: '' }])
    expect(profileBackend.saved()).toMatchObject({ jobTitle: null, phoneNumber: '+84 912 345 678' })
  })

  it('has the saved value after a reload', async () => {
    const first = await open()
    const user = userEvent.setup()
    await user.clear(field('Số điện thoại'))
    await user.type(field('Số điện thoại'), '0901 000 111')
    await user.click(save())
    await screen.findByText(SAVED)
    first.unmount()

    await open()
    expect(field('Số điện thoại')).toHaveValue('0901 000 111')
  })

  it('puts a 400 under the field it names and keeps what the user typed in the others', async () => {
    await open()
    const user = userEvent.setup()

    await user.clear(field('Họ và tên'))
    await user.type(field('Họ và tên'), 'Bình Trần')
    await user.clear(field('Số điện thoại'))
    await user.type(field('Số điện thoại'), 'abc')
    await user.click(save())

    const phone = field('Số điện thoại')
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Số điện thoại chỉ gồm chữ số, khoảng trắng và + ( ) - . , tối đa 30 ký tự.')).toHaveAttribute('id', phone.getAttribute('aria-describedby'))
    expect(phone).toHaveValue('abc')
    expect(field('Họ và tên')).toHaveValue('Bình Trần')
    expect(field('Họ và tên')).not.toHaveAttribute('aria-invalid')
    expect(profileBackend.saved().displayName).toBe(PROFILE.displayName)

    // Typing in the field takes its error away.
    await user.type(phone, '1')
    expect(phone).not.toHaveAttribute('aria-invalid')
  })

  it('shows an empty name as an error under the name', async () => {
    await open()
    const user = userEvent.setup()

    await user.clear(field('Họ và tên'))
    await user.click(save())

    await screen.findByText('Họ và tên không được để trống và tối đa 200 ký tự.')
    expect(field('Họ và tên')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the web sentence of the field, not the English message of the server', async () => {
    server.use(
      http.patch('/api/profile', () =>
        HttpResponse.json(
          { status: 400, code: 'VALIDATION_FAILED', errors: [{ field: 'bio', message: 'bio must be at most 500 characters' }, { field: 'jobTitle', message: 'jobTitle too long' }] },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    await open()
    const user = userEvent.setup()
    await user.type(field('Giới thiệu ngắn (Bio)'), 'x')
    await user.type(field('Chức danh / Vai trò'), 'x')
    await user.click(save())

    await screen.findByText('Giới thiệu tối đa 500 ký tự.')
    expect(screen.getByText('Chức danh tối đa 100 ký tự.')).toBeInTheDocument()
    expect(screen.queryByText(/characters|too long/)).not.toBeInTheDocument()
  })

  it('says a failed save with a retry that sends the same change', async () => {
    let fail = true
    server.use(
      http.patch('/api/profile', async ({ request }) => {
        if (fail) {
          fail = false
          return problem(500, 'INTERNAL_ERROR')
        }
        const body = (await request.json()) as Record<string, string>
        return HttpResponse.json({ ...PROFILE, ...body })
      }),
    )
    await open()
    const user = userEvent.setup()
    await user.clear(field('Địa điểm làm việc'))
    await user.type(field('Địa điểm làm việc'), 'Huế')
    await user.click(save())

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Không lưu được thông tin cá nhân. Vui lòng thử lại.')).toBeInTheDocument()
    expect(field('Địa điểm làm việc')).toHaveValue('Huế')

    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    await screen.findByText(SAVED)
  })

  it('says when the profile cannot be loaded, keeps the header from me, and loads on retry', async () => {
    let fail = true
    server.use(http.get('/api/profile', () => (fail ? problem(500, 'INTERNAL_ERROR') : HttpResponse.json(PROFILE))))
    stubViewport(1440)
    renderApp('/profile')
    const user = userEvent.setup()

    await screen.findByText('Không tải được thông tin cá nhân.')
    expect(screen.getByRole('heading', { level: 2, name: 'An Nguyễn' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(field('Số điện thoại')).toHaveValue('+84 912 345 678'))
  })

  it('marks what has no server yet "Sắp có" and sends nothing from it', async () => {
    await open()

    expect(screen.getAllByText('Sắp có')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Cập nhật mật khẩu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Quản lý 2FA' })).toBeDisabled()
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeDisabled()
    expect(profileBackend.patches()).toEqual([])
  })
})
