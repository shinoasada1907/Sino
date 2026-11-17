import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ME_QUERY_KEY } from '@/features/auth/useAuth'
import { AVATAR_SIZE } from './avatarImage'
import { FakeContext, landsAt } from '@/test/fakeCanvas'
import { PROFILE, profileBackend, profileHandlers, resetProfileBackend } from '@/test/fixtures/profileApi'
import { stubPictureDecoding } from '@/test/pictureDecoding'
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

// profile-info PI-05: the picture box (spec user-profile-screen, Đổi ảnh đại diện bằng tệp; D-477, D-481).
describe('the profile picture box', () => {
  beforeEach(() => {
    resetProfileBackend()
    server.use(...profileHandlers)
  })

  type User = ReturnType<typeof userEvent.setup>
  const openBox = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Thay đổi ảnh đại diện' }))
    return screen.findByRole('dialog', { name: 'Đổi ảnh đại diện' })
  }
  const fileInput = () => screen.getByLabelText('Tệp ảnh', { selector: 'input' })
  const photo = new File(['x'], 'anh.jpg', { type: 'image/jpeg' })
  const saveButton = (box: HTMLElement) => within(box).getByRole('button', { name: 'Lưu ảnh' })

  async function pickAndSave(user: User, box: HTMLElement) {
    await user.upload(fileInput(), photo)
    await waitFor(() => expect(saveButton(box)).toBeEnabled())
    await user.click(saveButton(box))
  }

  it('sends a 256 x 256 WebP as the part file and shows the new picture in the header and the me cache', async () => {
    const { decoded, exported } = stubPictureDecoding({ size: { width: 4000, height: 3000 } })
    const { queryClient } = await open()
    const user = userEvent.setup()
    const box = await openBox(user)
    expect(saveButton(box)).toBeDisabled()
    expect(within(box).queryByRole('button', { name: 'Xóa ảnh' })).not.toBeInTheDocument()

    await pickAndSave(user, box)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Once to check the file can be read, once to cut it.
    expect(decoded).toEqual([photo, photo])
    expect(exported).toEqual([{ width: 256, height: 256 }])
    expect(profileBackend.avatars()).toHaveLength(1)
    expect(profileBackend.avatars()[0].type).toBe('image/webp')
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toMatchObject({ avatarUrl: '/api/profile/avatar?v=00000001' })
    expect(document.querySelector('[data-slot="avatar"] img[src="/api/profile/avatar?v=00000001"]')).toBeInTheDocument()
  })

  it('shows the round frame after a file is chosen, with zoom, turn and reset; nothing is sent until Lưu ảnh', async () => {
    stubPictureDecoding({ size: { width: 4000, height: 3000 } })
    await open()
    const user = userEvent.setup()
    const box = await openBox(user)
    expect(within(box).queryByRole('slider', { name: 'Phóng to' })).not.toBeInTheDocument()

    await user.upload(fileInput(), photo)

    expect(await within(box).findByRole('slider', { name: 'Phóng to' })).toHaveValue('1')
    expect(box.querySelector('.reactEasyCrop_Container')).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: 'Xoay 90°' })).toBeEnabled()
    expect(within(box).getByRole('button', { name: 'Chọn ảnh khác' })).toBeInTheDocument()
    expect(within(box).queryByText('Theo ảnh')).not.toBeInTheDocument()
    expect(profileBackend.avatars()).toHaveLength(0)

    fireEvent.change(within(box).getByRole('slider', { name: 'Phóng to' }), { target: { value: '2.5' } })
    expect(within(box).getByRole('slider', { name: 'Phóng to' })).toHaveValue('2.5')
    await user.click(within(box).getByRole('button', { name: 'Đặt lại' }))
    expect(within(box).getByRole('slider', { name: 'Phóng to' })).toHaveValue('1')
  })

  it('cuts what the frame was turned to: a quarter turn changes the square that is sent', async () => {
    stubPictureDecoding({ size: { width: 4000, height: 3000 } })
    const contexts: FakeContext[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const context = new FakeContext()
      contexts.push(context)
      return context as unknown as RenderingContext
    })
    await open()
    const user = userEvent.setup()
    const box = await openBox(user)
    await user.upload(fileInput(), photo)
    await within(box).findByRole('slider', { name: 'Phóng to' })

    await user.click(within(box).getByRole('button', { name: 'Xoay 90°' }))
    await user.click(saveButton(box))

    await waitFor(() => expect(profileBackend.avatars()).toHaveLength(1))
    // 4000 x 3000 turned shows 3000 x 4000: the centre square is y 500..3500, and the picture is drawn turned 90 degrees.
    const drawing = contexts[0].drawings[0]
    expect(landsAt(drawing, 0, 0).map(Math.round)).toEqual([AVATAR_SIZE, -43])
    expect(landsAt(drawing, 4000, 3000).map(Math.round)).toEqual([0, 299])
  })

  it('goes back to the first picture of the frame after Đặt lại, a turn included', async () => {
    stubPictureDecoding({ size: { width: 4000, height: 3000 } })
    const contexts: FakeContext[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const context = new FakeContext()
      contexts.push(context)
      return context as unknown as RenderingContext
    })
    await open()
    const user = userEvent.setup()
    const box = await openBox(user)
    await user.upload(fileInput(), photo)
    await within(box).findByRole('slider', { name: 'Phóng to' })

    await user.click(within(box).getByRole('button', { name: 'Xoay 90°' }))
    await user.click(within(box).getByRole('button', { name: 'Đặt lại' }))
    await user.click(saveButton(box))

    await waitFor(() => expect(profileBackend.avatars()).toHaveLength(1))
    // Not turned: the centre square is x 500..3500.
    expect(landsAt(contexts[0].drawings[0], 500, 0).map(Math.round)).toEqual([0, 0])
  })

  it('refuses a file that is not a picture before sending anything', async () => {
    stubPictureDecoding()
    await open()
    const user = userEvent.setup({ applyAccept: false })
    const box = await openBox(user)

    // The file dialog would not offer it, but a dropped file can still arrive.
    await user.upload(fileInput(), new File(['hi'], 'ghi-chu.txt', { type: 'text/plain' }))

    expect(await within(box).findByRole('alert')).toHaveTextContent('Tệp này không phải ảnh')
    expect(saveButton(box)).toBeDisabled()
    expect(profileBackend.avatars()).toHaveLength(0)
  })

  it('says so when the browser cannot read the picture', async () => {
    stubPictureDecoding({ unreadable: () => true })
    await open()
    const user = userEvent.setup()
    const box = await openBox(user)
    await user.upload(fileInput(), photo)

    expect(await within(box).findByRole('alert')).toHaveTextContent('Không đọc được ảnh này')
    expect(profileBackend.avatars()).toHaveLength(0)
  })

  it.each([
    [413, 'AVATAR_TOO_LARGE', 'Ảnh quá lớn'],
    [400, 'VALIDATION_FAILED', 'Máy chủ không nhận ảnh này'],
  ])('shows the %i of the server in the box and keeps the old picture', async (status, code, text) => {
    stubPictureDecoding()
    resetProfileBackend({ ...PROFILE, avatarUrl: '/api/profile/avatar?v=aaaaaaaa' })
    server.use(http.put('/api/profile/avatar', () => problem(status, code)))
    const { queryClient } = await open()
    queryClient.setQueryData(ME_QUERY_KEY, { email: PROFILE.email, displayName: PROFILE.displayName, avatarUrl: '/api/profile/avatar?v=aaaaaaaa' })
    const user = userEvent.setup()
    const box = await openBox(user)

    await pickAndSave(user, box)

    expect(await within(box).findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toMatchObject({ avatarUrl: '/api/profile/avatar?v=aaaaaaaa' })
    expect(saveButton(box)).toBeEnabled()
  })

  it('says so when there is no network', async () => {
    stubPictureDecoding()
    server.use(http.put('/api/profile/avatar', () => HttpResponse.error()))
    await open()
    const user = userEvent.setup()
    const box = await openBox(user)

    await pickAndSave(user, box)

    expect(await within(box).findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
  })

  it('removes the picture: the header and the me cache lose it and the first letter stands in', async () => {
    resetProfileBackend({ ...PROFILE, avatarUrl: '/api/profile/avatar?v=aaaaaaaa' })
    const { queryClient } = await open()
    queryClient.setQueryData(ME_QUERY_KEY, { email: PROFILE.email, displayName: PROFILE.displayName, avatarUrl: '/api/profile/avatar?v=aaaaaaaa' })
    const user = userEvent.setup()
    const box = await openBox(user)

    await user.click(within(box).getByRole('button', { name: 'Xóa ảnh' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(profileBackend.avatarDeletes()).toBe(1)
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toMatchObject({ avatarUrl: null })
    expect(document.querySelector('[data-slot="avatar"] img')).not.toBeInTheDocument()
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
  })
})
